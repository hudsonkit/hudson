// ---------------------------------------------------------------------------
// Harness models
//
// "Which models can this harness run for me right now?" — asked of the
// harness itself, so the answer follows the signed-in account. A static
// catalog says what a vendor sells; it can't say what this account may use
// (Codex on a ChatGPT plan refuses models the catalog lists, for example).
//
//   codex  → `codex app-server` model/list
//   claude → the Anthropic models endpoint, when an API key is passed
//   opencode → `opencode2 models`, narrowed to the providers it is signed into
//
// Harnesses that can't enumerate return nothing; hosts fall back to a picked
// model id or the harness default.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { resolveOpenCodeBin, type ScoutHarness } from './harnesses';

export interface HarnessModel {
  harness: ScoutHarness;
  /** Model id to pass back as `config.model`. */
  model: string;
  name: string;
  description?: string;
  /** The harness's own default for this account. */
  isDefault?: boolean;
  /** Reasoning efforts the model accepts, when the harness reports them. */
  efforts?: string[];
}

export interface ListHarnessModelsOptions {
  /** Harnesses to ask. Defaults to every harness that can enumerate. */
  harnesses?: ScoutHarness[];
  /** Anthropic API key for the claude list. Without it, claude is skipped. */
  anthropicApiKey?: string;
  /** OpenCode provider ids to list (e.g. `opencode-go`). Defaults to the signed-in ones. */
  opencodeProviders?: string[];
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface ListHarnessModelsResult {
  models: HarnessModel[];
  /** Harness → reason, for harnesses that were asked and failed. */
  errors: Partial<Record<ScoutHarness, string>>;
}

interface CodexModel {
  id: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  hidden?: boolean;
  supportedReasoningEfforts?: { reasoningEffort: string }[];
}

export function fromCodexModels(data: CodexModel[]): HarnessModel[] {
  return data
    .filter((m) => m.id && !m.hidden)
    .map((m) => ({
      harness: 'codex' as const,
      model: m.id,
      name: m.displayName ?? m.id,
      ...(m.description ? { description: m.description } : {}),
      ...(m.isDefault ? { isDefault: true } : {}),
      ...(m.supportedReasoningEfforts?.length
        ? { efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort) }
        : {}),
    }));
}

/** One short `codex app-server` session: initialize, then model/list following the cursor. */
export function codexModels(timeoutMs = 15_000, bin = 'codex'): Promise<HarnessModel[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const waiting = new Map<number, { ok: (r: unknown) => void; fail: (e: Error) => void }>();
    let next = 1;
    let buf = '';
    const send = (m: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
    const request = <T = unknown>(method: string, params: object) =>
      new Promise<T>((ok, fail) => {
        const id = next++;
        waiting.set(id, { ok: r => ok(r as T), fail });
        send({ id, method, params });
      });
    const done = (fn: () => void) => {
      clearTimeout(timer);
      child.kill();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error(`codex model/list timed out after ${timeoutMs}ms`))), timeoutMs);

    child.on('error', (err) => done(() => reject(err)));
    child.on('close', () => {
      for (const w of waiting.values()) w.fail(new Error('codex app-server closed'));
    });
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let m: { id?: number; method?: string; result?: unknown; error?: { message?: string } };
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        const w = typeof m.id === 'number' && !m.method ? waiting.get(m.id) : undefined;
        if (!w) continue;
        waiting.delete(m.id!);
        if (m.error) w.fail(new Error(m.error.message ?? 'codex app-server error'));
        else w.ok(m.result);
      }
    });

    (async () => {
      await request('initialize', { clientInfo: { name: 'hudsonkit-ai', version: '1' } });
      send({ method: 'initialized' });
      const out: CodexModel[] = [];
      let cursor: string | null | undefined;
      do {
        const r = await request<{ data?: CodexModel[]; nextCursor?: string | null }>(
          'model/list',
          cursor ? { cursor } : {},
        );
        out.push(...(r.data ?? []));
        cursor = r.nextCursor;
      } while (cursor);
      return fromCodexModels(out);
    })().then(
      (models) => done(() => resolve(models)),
      (err) => done(() => reject(err)),
    );
  });
}

/** The Anthropic list, newest first as the API returns it; the newest counts as the default. */
export async function claudeModels(apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<HarnessModel[]> {
  const res = await fetchImpl('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Anthropic returned HTTP ${res.status}`);
  const data = ((await res.json()) as { data?: { id: string; display_name?: string }[] }).data ?? [];
  return data.map((m, i) => ({
    harness: 'claude' as const,
    model: m.id,
    name: m.display_name ?? m.id,
    ...(i === 0 ? { isDefault: true } : {}),
  }));
}

/** Run a CLI to completion and return stdout; rejects on a non-zero exit or timeout. */
function runCli(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split('\n').pop() || `${bin} exited with ${code}`));
    });
  });
}

/** `opencode models` prints one `provider/model` per line. */
export function parseOpenCodeModels(stdout: string, providers?: ReadonlySet<string>): HarnessModel[] {
  const models: HarnessModel[] = [];
  for (const line of stdout.split('\n')) {
    const id = line.trim();
    const slash = id.indexOf('/');
    if (slash <= 0 || /\s/.test(id)) continue;
    if (providers && !providers.has(id.slice(0, slash))) continue;
    models.push({ harness: 'opencode', model: id, name: id.slice(slash + 1) });
  }
  return models;
}

/**
 * Provider ids from `opencode auth list`, whose first column is the display
 * name ("OpenCode Go" → `opencode-go`). The free `opencode` provider needs no
 * sign-in. A stored credential can still be expired; hosts that know better
 * pass `opencodeProviders`.
 */
export function parseOpenCodeAuthProviders(stdout: string): Set<string> {
  const ids = new Set<string>(['opencode']);
  for (const line of stdout.split('\n')) {
    const name = line.split(/\s{2,}/)[0]?.trim();
    if (name) ids.add(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }
  return ids;
}

/** OpenCode's models for the providers it can run, preferring the V2 CLI. */
export async function opencodeModels(
  opts: { providers?: string[]; timeoutMs?: number; bin?: string } = {},
): Promise<HarnessModel[]> {
  const bin = opts.bin ?? resolveOpenCodeBin();
  if (!bin) throw new Error('OpenCode is not installed (no `opencode2` or `opencode`).');
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const providers = opts.providers
    ? new Set(opts.providers)
    : parseOpenCodeAuthProviders(await runCli(bin, ['auth', 'list'], timeoutMs));
  return parseOpenCodeModels(await runCli(bin, ['models'], timeoutMs), providers);
}

/** Ask each harness for its models. A harness that fails lands in `errors`, never throws. */
export async function listHarnessModels(opts: ListHarnessModelsOptions = {}): Promise<ListHarnessModelsResult> {
  const wanted = new Set<ScoutHarness>(opts.harnesses ?? ['codex', 'claude', 'opencode']);
  const jobs: [ScoutHarness, () => Promise<HarnessModel[]>][] = [];
  if (wanted.has('codex')) jobs.push(['codex', () => codexModels(opts.timeoutMs)]);
  if (wanted.has('opencode')) {
    jobs.push(['opencode', () => opencodeModels({ providers: opts.opencodeProviders, timeoutMs: opts.timeoutMs })]);
  }
  if (wanted.has('claude') && opts.anthropicApiKey) {
    const key = opts.anthropicApiKey;
    jobs.push(['claude', () => claudeModels(key, opts.fetch, opts.timeoutMs)]);
  }

  const models: HarnessModel[] = [];
  const errors: ListHarnessModelsResult['errors'] = {};
  await Promise.all(
    jobs.map(async ([harness, get]) => {
      try {
        models.push(...(await get()));
      } catch (err) {
        errors[harness] = err instanceof Error ? err.message : String(err);
      }
    }),
  );
  return { models, errors };
}
