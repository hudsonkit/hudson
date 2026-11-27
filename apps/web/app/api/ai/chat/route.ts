import { createPiAiBackend, type PiAiUIRequest } from '@hudsonkit/ai/pi-ai';
import { streamFromCLI } from './cli';
import { DEFAULT_MODELS, loadCredentials } from '../providers';
import { loadToolset } from '../toolsets';
import { appCredentials, compileAppToolset } from '../app-toolset';
import { CODEX_PROVIDER, streamCodexChat } from '../codex';
import { CHATGPT_PROVIDER, chatGPTAccessToken } from '../chatgpt';

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ai/chat: ${msg}`);
}

// CLI mode only works for providers that have a local CLI binary speaking
// stream-json. Everything else (copilot, openai, minimax, …) must go API.
const CLI_CAPABLE_PROVIDERS = new Set(['anthropic', 'claude']);

const piBackend = createPiAiBackend();

type ReasoningEffort = NonNullable<PiAiUIRequest['effort']>;
const REASONING_EFFORTS = new Set<ReasoningEffort>(['off', 'low', 'medium', 'high']);

function parseReasoningEffort(value: unknown): ReasoningEffort | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && REASONING_EFFORTS.has(value as ReasoningEffort)) {
    return value as ReasoningEffort;
  }
  return null;
}

export async function POST(req: Request) {
  const {
    messages,
    toolset,
    context = {},
    mode: requestedMode,
    sessionId,
    provider,
    model,
    effort: requestedEffort,
    appToolset: requestedToolset,
    credentials: requestedCredentials,
  } = await req.json();
  let appToolset;
  try {
    appToolset = compileAppToolset(requestedToolset);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid app toolset' }, { status: 400 });
  }
  const credentials = { ...loadCredentials(), ...appCredentials(requestedCredentials) };
  const effort = parseReasoningEffort(requestedEffort);
  if (effort === null) {
    return Response.json(
      { error: 'Invalid reasoning effort. Expected off, low, medium, or high.' },
      { status: 400 },
    );
  }
  const requested = requestedMode ?? process.env.AI_DEFAULT_MODE ?? 'api';

  // If the caller asked for CLI but their provider isn't CLI-capable, fall
  // back to API. Picking copilot/gemini + CLI mode used to silently spawn
  // `claude` with the wrong model and fail.
  const useCli = !appToolset && requested === 'cli' && (!provider || CLI_CAPABLE_PROVIDERS.has(provider));
  const mode = useCli ? 'cli' : 'api';
  if (requested === 'cli' && !useCli) {
    log(`forcing api mode: provider "${provider}" is not CLI-capable`);
  }

  log(`${mode} | ${provider ?? 'default'}/${model ?? 'default'} | toolset=${toolset} | ${messages.length} messages`);

  if (mode === 'cli') {
    return streamFromCLI(messages, toolset, context, sessionId);
  }

  // Codex runs the turn on the ChatGPT plan it is signed in with. It gets
  // Hudson's system prompt but not Hudson's tools.
  if (provider === CODEX_PROVIDER) {
    const system = appToolset ? appToolset.system : loadToolset(toolset, context).system;
    return streamCodexChat({ messages, system, model, effort, signal: req.signal });
  }

  // ChatGPT plan: pi-ai's openai provider with the signed-in access token.
  // pi-ai sees a non-API-key token and switches to ChatGPT-plan requests.
  let piProvider = provider;
  let piCredentials = credentials;
  if (provider === CHATGPT_PROVIDER) {
    let accessToken: string | null;
    try {
      accessToken = await chatGPTAccessToken();
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), { status: 401, headers: { 'Content-Type': 'text/plain' } });
    }
    if (!accessToken) {
      return new Response('Not signed in to ChatGPT. Use Continue with ChatGPT in Hudson AI settings.', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    piProvider = 'openai';
    piCredentials = { ...credentials, openai: accessToken };
  }

  try {
    return piBackend.streamUI({
      messages,
      toolset,
      context,
      provider: piProvider,
      model,
      effort,
      // Hudson's loadToolset returns Zod-schema-bearing tools shaped like
      // HudsonTool at runtime; the extra `toolPrompt` field is unused by
      // streamUI. Cast through unknown to bridge the structural mismatch.
      loadToolset: (appToolset ? () => appToolset : loadToolset) as never,
      loadCredentials: () => piCredentials,
      defaultModels: DEFAULT_MODELS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${message}`);
    return new Response(message || 'Unknown error in /api/ai/chat', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
