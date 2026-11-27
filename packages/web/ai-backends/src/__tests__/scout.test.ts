import { describe, it, expect, vi } from 'vitest';
import type { DispatchRequest, StreamEvent } from '../types';
import {
  createScoutBackend,
  composeInput,
  HARNESS_TRANSPORTS,
  type ScoutConfig,
  type ScoutLocalModule,
  type ScoutLocalTurnResult,
  type ScoutMeta,
} from '../adapters/scout';
import { parseClaudeOutput, claudeArgs } from '../scout/claude';
import { resolveOpenCodeBin } from '../scout/harnesses';
import { fromCodexModels, listHarnessModels, parseOpenCodeModels, parseOpenCodeAuthProviders } from '../scout/models';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function turnResult(text: string, over: Partial<ScoutLocalTurnResult> = {}): ScoutLocalTurnResult {
  return {
    text,
    transport: 'codex_app_server',
    session: { id: 'sess-1', nativeId: 'thread-1', reused: false, warm: false },
    usage: { inputTokens: 12, outputTokens: 3 },
    ...over,
  };
}

function fakeLocal(reply: (input: string) => string = () => 'PONG', forceTransport?: string) {
  const transportFor = (harness: string) =>
    forceTransport ?? HARNESS_TRANSPORTS[harness as keyof typeof HARNESS_TRANSPORTS][0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- records whatever options each backend call received
  const calls: { kind: 'complete' | 'create' | 'turn'; opts: any }[] = [];
  let alive = true;
  const local: ScoutLocalModule = {
    async completeLocalAgentTurn(opts) {
      calls.push({ kind: 'complete', opts });
      return turnResult(reply(opts.input), { transport: transportFor(opts.harness) });
    },
    async createLocalAgentClient(opts) {
      calls.push({ kind: 'create', opts });
      let turns = 0;
      return {
        async turn(t) {
          calls.push({ kind: 'turn', opts: t });
          turns += 1;
          return turnResult(reply(t.input), {
            transport: transportFor(opts.harness),
            session: { id: 'warm-1', reused: turns > 1, warm: true },
          });
        },
        async close() {
          alive = false;
        },
        isAlive: () => alive,
      };
    },
  };
  return { local, calls, kill: () => (alive = false) };
}

function req(config: ScoutConfig, over: Partial<DispatchRequest<ScoutConfig>> = {}): DispatchRequest<ScoutConfig> {
  return { conversationId: 'c1', messages: [], input: 'ping', config, ...over };
}

async function collect(it: AsyncIterable<StreamEvent<ScoutMeta>>) {
  const out: StreamEvent<ScoutMeta>[] = [];
  for await (const e of it) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

describe('scout backend', () => {
  it('runs a one-shot turn and emits text, usage, session, done', async () => {
    const { local, calls } = fakeLocal();
    const backend = createScoutBackend({ cwd: '/tmp', loadLocal: async () => local });

    const events = await collect(backend.stream(req({ harness: 'codex', model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { system: 'Be terse.' })));

    expect(events.map((e) => e.type)).toEqual(['text', 'usage', 'session', 'done']);
    expect(events[0]).toEqual({ type: 'text', delta: 'PONG' });
    expect(events[1]).toEqual({ type: 'usage', input: 12, output: 3 });
    expect(events[2]).toEqual({ type: 'session', sessionRef: 'thread-1' });
    expect(calls[0]).toMatchObject({
      kind: 'complete',
      opts: { harness: 'codex', model: 'gpt-5.6-luna', reasoningEffort: 'low', systemPrompt: 'Be terse.', cwd: '/tmp', input: 'ping' },
    });
  });

  it('rejects a reply that came back on another harness transport', async () => {
    // What agent-sessions 0.2.78 does with `opencode`: runs Cursor.
    const { local } = fakeLocal(undefined, 'cursor_acp');
    const backend = createScoutBackend({ loadLocal: async () => local });
    await expect(backend.dispatch(req({ harness: 'opencode' }))).rejects.toThrow(/ran on cursor_acp, not opencode_v2 or opencode_acp/);
  });

  it('turns an empty reply into an error instead of empty text', async () => {
    const { local } = fakeLocal(() => '   ');
    const backend = createScoutBackend({ loadLocal: async () => local });

    const events = await collect(backend.stream(req({ harness: 'codex' })));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', recoverable: false });
    await expect(backend.dispatch(req({ harness: 'codex' }))).rejects.toThrow(/empty reply/);
  });

  it('reports harness failures as a non-recoverable error', async () => {
    const backend = createScoutBackend({
      loadLocal: async () => ({
        completeLocalAgentTurn: async () => {
          throw new Error('model is not supported');
        },
        createLocalAgentClient: async () => {
          throw new Error('unused');
        },
      }),
    });
    await expect(backend.dispatch(req({ harness: 'codex', model: 'gpt-6-sol' }))).rejects.toThrow('model is not supported');
  });

  it('folds history into the input for cold turns', async () => {
    const { local, calls } = fakeLocal();
    const backend = createScoutBackend({ loadLocal: async () => local });
    await backend.dispatch(
      req({ harness: 'kimi' }, {
        messages: [
          { role: 'user', content: 'hi' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed content shape
          { role: 'assistant', content: [{ type: 'text', text: 'hello' }] as any },
        ],
        input: 'and now?',
      }),
    );
    expect(calls[0].opts.input).toBe('Conversation so far:\n\nUser: hi\n\nAssistant: hello\n\nUser: and now?');
  });

  it('reuses one warm session per conversation and sends only new input', async () => {
    const { local, calls } = fakeLocal();
    const backend = createScoutBackend({ loadLocal: async () => local });
    const config: ScoutConfig = { harness: 'codex', model: 'gpt-5.6-luna', warm: true };
    const history = [{ role: 'user' as const, content: 'earlier' }];

    const first = await backend.dispatch(req(config, { messages: history, input: 'one' }));
    const second = await backend.dispatch(req(config, { messages: history, input: 'two' }));

    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(1);
    const turns = calls.filter((c) => c.kind === 'turn');
    expect(turns[0].opts.input).toContain('User: earlier');
    expect(turns[1].opts.input).toBe('two');
    expect(first.meta?.reused).toBe(false);
    expect(second.meta?.reused).toBe(true);

    await backend.dispatch(req(config, { conversationId: 'c2', input: 'other' }));
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(2);
  });

  it('replaces a warm session that died', async () => {
    const { local, calls, kill } = fakeLocal();
    const backend = createScoutBackend({ loadLocal: async () => local });
    const config: ScoutConfig = { harness: 'opencode', warm: true };

    await backend.dispatch(req(config));
    kill();
    await backend.dispatch(req(config));
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(2);
  });

  it('routes claude through the Claude runner, not agent-sessions', async () => {
    const loadLocal = vi.fn();
    const runClaude = vi.fn(async () => ({ text: 'PONG', sessionId: 's-claude', usage: { input: 5, output: 1, cost: 0.001 } }));
    const backend = createScoutBackend({ cwd: '/tmp', loadLocal, runClaude });

    const result = await backend.dispatch(req({ harness: 'claude', model: 'claude-haiku-4-5', reasoningEffort: 'low' }, { system: 'S' }));

    expect(result).toMatchObject({ reply: 'PONG', sessionRef: 's-claude', usage: { input: 5, output: 1, cost: 0.001 } });
    expect(result.meta).toMatchObject({ harness: 'claude', transport: 'claude_cli' });
    expect(runClaude).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5', effort: 'low', systemPrompt: 'S', cwd: '/tmp' }));
    expect(loadLocal).not.toHaveBeenCalled();
  });

  it('status reports a missing harness binary', async () => {
    const backend = createScoutBackend({ which: () => null, loadLocal: async () => fakeLocal().local });
    expect(await backend.status!({ harness: 'cursor' })).toEqual({
      available: false,
      reason: 'Cursor is not installed (no `cursor-agent` on PATH).',
    });
  });

  it('status reports a missing agent-sessions package', async () => {
    const backend = createScoutBackend({
      which: (b) => `/bin/${b}`,
      loadLocal: async () => {
        throw new Error('Cannot find package');
      },
    });
    expect(await backend.status!({ harness: 'codex' })).toMatchObject({ available: false });
    expect(await backend.status!({ harness: 'claude' })).toEqual({ available: true });
  });
});

describe('composeInput', () => {
  it('passes input through with no history or when warm', () => {
    expect(composeInput('x', [], true)).toBe('x');
    expect(composeInput('x', [{ role: 'user', content: 'a' }], false)).toBe('x');
  });
  it('drops system and tool messages from the transcript', () => {
    expect(
      composeInput('x', [
        { role: 'system', content: 's' },
        { role: 'tool', content: 't' },
      ], true),
    ).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// Claude CLI
// ---------------------------------------------------------------------------

describe('claude cli', () => {
  it('runs with no tools and no MCP servers', () => {
    const args = claudeArgs({ input: 'x', cwd: '/', timeoutMs: 1, model: 'claude-sonnet-5', systemPrompt: 'S' });
    expect(args).toEqual([
      '-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence',
      '--model', 'claude-sonnet-5', '--system-prompt', 'S',
    ]);
  });

  it('reads the result event out of the event array', () => {
    const out = JSON.stringify([
      { type: 'system', subtype: 'init' },
      {
        type: 'result',
        is_error: false,
        result: 'PONG',
        session_id: 'abc',
        total_cost_usd: 0.0013,
        usage: { input_tokens: 1000, cache_read_input_tokens: 31, output_tokens: 71 },
      },
    ]);
    expect(parseClaudeOutput(out)).toEqual({ text: 'PONG', sessionId: 'abc', usage: { input: 1031, output: 71, cost: 0.0013 } });
  });

  it('throws on an error result', () => {
    expect(() => parseClaudeOutput(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in' }))).toThrow('Not logged in');
  });
});

// ---------------------------------------------------------------------------
// Harness models
// ---------------------------------------------------------------------------

describe('harness models', () => {
  it('maps codex model/list and drops hidden models', () => {
    expect(
      fromCodexModels([
        { id: 'gpt-6-astra', displayName: 'GPT-6-Astra', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'max' }] },
        { id: 'internal', hidden: true },
      ]),
    ).toEqual([{ harness: 'codex', model: 'gpt-6-astra', name: 'GPT-6-Astra', isDefault: true, efforts: ['low', 'max'] }]);
  });

  it('lists claude models from the Anthropic endpoint and marks the newest default', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-haiku-4-5' }] })),
    ) as unknown as typeof fetch;
    const { models, errors } = await listHarnessModels({ harnesses: ['claude'], anthropicApiKey: 'k', fetch: fetchImpl });
    expect(errors).toEqual({});
    expect(models).toEqual([
      { harness: 'claude', model: 'claude-opus-5-5', name: 'Claude Opus 5.5', isDefault: true },
      { harness: 'claude', model: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
    ]);
  });

  it('collects failures per harness instead of throwing', async () => {
    const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    const { models, errors } = await listHarnessModels({ harnesses: ['claude'], anthropicApiKey: 'bad', fetch: fetchImpl });
    expect(models).toEqual([]);
    expect(errors.claude).toBe('Anthropic returned HTTP 401');
  });

  it('skips claude without a key', async () => {
    const { models, errors } = await listHarnessModels({ harnesses: ['claude'] });
    expect(models).toEqual([]);
    expect(errors).toEqual({});
  });
});

describe('resolveOpenCodeBin', () => {
  it('prefers a known install over an opencode2 earlier on PATH', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'oc-bin-'));
    const stale = join(root, 'node_modules', '.bin');
    const good = join(root, '.bun', 'bin');
    for (const dir of [stale, good]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'opencode2'), '#!/bin/sh\n', { mode: 0o755 });
    }
    expect(resolveOpenCodeBin({ HOME: root, PATH: stale })).toBe(join(good, 'opencode2'));
    expect(resolveOpenCodeBin({ HOME: join(root, 'none'), PATH: stale })).toBe(join(stale, 'opencode2'));
    expect(resolveOpenCodeBin({ HOME: root, PATH: stale, OPENCODE_V2_BIN: join(stale, 'opencode2') })).toBe(
      join(stale, 'opencode2'),
    );
  });
});

describe('opencode models', () => {
  const authList = [
    'OpenCode Go            OpenCode Go                 stored',
    'Anthropic              default                     stored',
    'GitHub Copilot         GITHUB_TOKEN                environment',
  ].join('\n');

  it('maps signed-in display names to provider ids, plus the free provider', () => {
    expect([...parseOpenCodeAuthProviders(authList)].sort()).toEqual([
      'anthropic',
      'github-copilot',
      'opencode',
      'opencode-go',
    ]);
  });

  it('keeps only models from the given providers', () => {
    const out = 'opencode-go/glm-5.2\nopenrouter/x/y\nopencode/big-pickle\nnot a model\n';
    expect(parseOpenCodeModels(out, new Set(['opencode-go', 'opencode']))).toEqual([
      { harness: 'opencode', model: 'opencode-go/glm-5.2', name: 'glm-5.2' },
      { harness: 'opencode', model: 'opencode/big-pickle', name: 'big-pickle' },
    ]);
    expect(parseOpenCodeModels(out)).toHaveLength(3);
  });
});
