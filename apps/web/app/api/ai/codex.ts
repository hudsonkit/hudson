/**
 * Hudson AI on Codex: chat through the Codex CLI on this machine, billed to
 * the ChatGPT plan Codex is signed in with (`codex login`).
 *
 * OpenAI documents Codex app-server as a supported way for an app to use a
 * user's ChatGPT plan, so Hudson owns no OAuth here: Codex holds the sign-in.
 * This only works where the Next server runs next to a Codex install, which
 * means local Hudson. The hosted site has no Codex, so the provider is never
 * listed there (see `codexStatus`).
 *
 * Safety: Codex is an agent. agent-sessions starts it with full machine
 * access and no approval prompts by default, which a chat box must not do.
 * This module starts Codex itself with a read-only sandbox, in an empty
 * working directory, so a chat turn can read but not change anything.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import {
  codexModels,
  createScoutBackend,
  type HarnessModel,
  type ScoutLocalModule,
  type ScoutLocalTurnResult,
} from '@hudsonkit/ai/scout';
import type { Message } from '@hudsonkit/ai';
import { getOrCreateCodexAppServerClient } from '@openscout/agent-sessions/local';
import { AI_LOCAL_PROVIDER_OPTIONS, AI_PROVIDER_DEFAULT_MODELS, type AISelectOption } from '@/app/lib/ai-models';

export const CODEX_PROVIDER = 'codex';

const TURN_TIMEOUT_MS = 180_000;
const CODEX_CWD = join(homedir(), '.hudson', 'codex-chat');

const NO_TOOLS_NOTE =
  'Hudson app tools are not available in this chat. Answer in text only. ' +
  'Do not run shell commands or read files unless the user asks for it.';

interface CodexTurnOptions {
  cwd: string;
  systemPrompt?: string;
  input: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One cold Codex turn in a read-only sandbox, then shut the app-server down. */
async function runReadOnlyCodexTurn(opts: CodexTurnOptions): Promise<ScoutLocalTurnResult> {
  const sessionId = `hudson-chat-${randomUUID()}`;
  const root = join(homedir(), '.scout', 'local', 'codex', sessionId);
  const client = getOrCreateCodexAppServerClient({
    agentName: 'Hudson AI',
    sessionId,
    cwd: opts.cwd,
    systemPrompt: opts.systemPrompt?.trim() || 'You are Hudson AI, a concise assistant.',
    runtimeDirectory: join(root, 'runtime'),
    logsDirectory: join(root, 'logs'),
    sandbox: 'read-only',
    approvalPolicy: 'never',
    launchArgs: [
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.reasoningEffort ? ['--reasoning-effort', opts.reasoningEffort] : []),
    ],
    clientInfo: { name: 'hudson-ai', title: 'Hudson AI', version: '0.0.0' },
  } as Parameters<typeof getOrCreateCodexAppServerClient>[0]);

  const onAbort = () => void client.interrupt().catch(() => undefined);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await client.invoke(opts.input, opts.timeoutMs ?? TURN_TIMEOUT_MS);
    return {
      text: result.output,
      transport: 'codex_app_server',
      session: { id: sessionId, nativeId: result.threadId, reused: false, warm: false },
    };
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    await client.shutdown({ reason: 'Hudson AI turn finished' }).catch(() => undefined);
  }
}

/** The agent-sessions surface the Scout backend needs, restricted to read-only Codex. */
const readOnlyCodexModule: ScoutLocalModule = {
  completeLocalAgentTurn(opts) {
    if (opts.harness !== 'codex') throw new Error(`Hudson AI only runs Codex here, not ${opts.harness}.`);
    return runReadOnlyCodexTurn(opts);
  },
  async createLocalAgentClient() {
    throw new Error('Warm Codex sessions are not enabled for Hudson AI.');
  },
};

const backend = createScoutBackend({
  cwd: CODEX_CWD,
  timeoutMs: TURN_TIMEOUT_MS,
  loadLocal: async () => readOnlyCodexModule,
});

// ---------------------------------------------------------------------------
// Availability + models
// ---------------------------------------------------------------------------

export interface CodexStatus {
  available: boolean;
  reason?: string;
  models: HarnessModel[];
}

const STATUS_TTL_MS = 60_000;
let cachedStatus: { at: number; value: Promise<CodexStatus> } | null = null;

/**
 * Whether Codex is installed here and which models its account may run.
 * Codex answers the model list itself, so an account that is not signed in
 * comes back with no models and the provider stays hidden.
 */
export function codexStatus(): Promise<CodexStatus> {
  if (cachedStatus && Date.now() - cachedStatus.at < STATUS_TTL_MS) return cachedStatus.value;
  const value = (async (): Promise<CodexStatus> => {
    const status = (await backend.status?.({ harness: 'codex' })) ?? { available: true };
    if (!status.available) return { available: false, reason: status.reason, models: [] };
    try {
      const models = await codexModels(15_000);
      if (models.length === 0) return { available: false, reason: 'Codex returned no models. Run `codex login`.', models };
      return { available: true, models };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : String(err), models: [] };
    }
  })();
  cachedStatus = { at: Date.now(), value };
  return value;
}

export function codexModelOptions(models: HarnessModel[]): AISelectOption[] {
  return models.map((m) => ({ value: m.model, label: m.name, provider: CODEX_PROVIDER }));
}

export function codexProviderOption(): AISelectOption {
  return AI_LOCAL_PROVIDER_OPTIONS.find((option) => option.value === CODEX_PROVIDER)!;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

interface UIMessageLike {
  role?: string;
  content?: unknown;
  parts?: { type?: string; text?: string }[];
}

function messageText(message: UIMessageLike): string {
  if (Array.isArray(message.parts)) {
    return message.parts.map((p) => (p?.type === 'text' ? p.text ?? '' : '')).join('');
  }
  return typeof message.content === 'string' ? message.content : '';
}

/** Split UI messages into prior history and the new user input. */
export function toCodexTurn(messages: UIMessageLike[]): { history: Message[]; input: string } {
  const turns: Message[] = [];
  for (const message of messages) {
    const text = messageText(message).trim();
    if (!text) continue;
    if (message.role === 'user' || message.role === 'assistant') turns.push({ role: message.role, content: text });
  }
  const last = turns.at(-1);
  if (!last || last.role !== 'user') return { history: turns, input: '' };
  return { history: turns.slice(0, -1), input: last.content as string };
}

export function streamCodexChat(opts: {
  messages: UIMessageLike[];
  system?: string;
  model?: string;
  effort?: string;
  signal?: AbortSignal;
}): Response {
  const { history, input } = toCodexTurn(opts.messages);
  if (!input) {
    return new Response('Codex chat needs a user message last.', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }
  mkdirSync(CODEX_CWD, { recursive: true });
  const system = [opts.system, NO_TOOLS_NOTE].filter(Boolean).join('\n\n---\n\n');
  const reasoningEffort = opts.effort && opts.effort !== 'off' ? opts.effort : undefined;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      for await (const event of backend.stream({
        conversationId: randomUUID(),
        messages: history,
        input,
        system,
        config: {
          harness: 'codex',
          model: opts.model || AI_PROVIDER_DEFAULT_MODELS.codex,
          reasoningEffort,
        },
        signal: opts.signal,
      })) {
        if (event.type === 'text') {
          const id = generateId();
          writer.write({ type: 'text-start', id });
          writer.write({ type: 'text-delta', id, delta: event.delta });
          writer.write({ type: 'text-end', id });
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
  return createUIMessageStreamResponse({ stream });
}
