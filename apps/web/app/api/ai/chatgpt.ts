/**
 * Hudson AI on a ChatGPT plan, directly: OpenAI's "Sign in with ChatGPT".
 *
 * pi-ai implements the official flow (dynamic client registration, PKCE,
 * loopback callback on 127.0.0.1:1455, `chatgpt.tokens.use.direct`). Hudson
 * only drives it: start the login, store the credential, refresh it, revoke
 * it on sign-out. Inference then goes through pi-ai's `openai` provider with
 * the access token, which pi-ai recognises and sends in ChatGPT-plan mode.
 *
 * Local Hudson only. OpenAI allows plan usage for open-source and local apps;
 * a hosted app needs OpenAI's approval first. The hosted site has no Next
 * server, so none of this runs there.
 *
 * The credential lives in a sealed file next to the local vault, never in
 * the browser, process.env or logs.
 */

import { randomUUID } from 'node:crypto';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import {
  deleteHudsonSealedDocument,
  readHudsonSealedDocument,
  writeHudsonSealedDocument,
} from '@/app/lib/localSecretVault';
import type { AISelectOption } from '@/app/lib/ai-models';

export const CHATGPT_PROVIDER = 'chatgpt';
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';

const CREDENTIAL_DOC = 'chatgpt-credential';
const DEVICE_DOC = 'chatgpt-device';
const AGENT_NAME = 'Hudson';
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const OPENID_CONFIGURATION = 'https://auth.openai.com/.well-known/openid-configuration';

export interface ChatGPTCredential {
  type: 'oauth';
  access: string;
  refresh: string;
  /** Epoch ms, already shortened by pi-ai's safety margin. */
  expires: number;
  clientId: string;
  scopes: string[];
  /** pi-ai may add fields; they round-trip untouched. */
  [key: string]: unknown;
}

export interface ChatGPTStatus {
  signedIn: boolean;
  pending: boolean;
  /** Authorize URL of a login in progress, so the UI can reopen it. */
  url?: string;
  error?: string;
}

/** Storage and OAuth calls, swappable in tests. */
export interface ChatGPTDeps {
  readCredential(): ChatGPTCredential | null;
  writeCredential(credential: ChatGPTCredential): void;
  deleteCredential(): void;
  refresh(credential: ChatGPTCredential, signal: AbortSignal): Promise<ChatGPTCredential>;
  now(): number;
}

function oauth() {
  const auth = openaiProvider().auth.oauth;
  if (!auth) throw new Error('This pi-ai build has no Sign in with ChatGPT support.');
  return auth;
}

const defaultDeps: ChatGPTDeps = {
  readCredential: () => readHudsonSealedDocument<ChatGPTCredential>(CREDENTIAL_DOC),
  writeCredential: (credential) => writeHudsonSealedDocument(CREDENTIAL_DOC, credential),
  deleteCredential: () => deleteHudsonSealedDocument(CREDENTIAL_DOC),
  refresh: async (credential, signal) => (await oauth().refresh(credential, signal)) as unknown as ChatGPTCredential,
  now: () => Date.now(),
};

/** OpenAI identifies each install by a stable UUID. Created on first sign-in. */
function deviceId(): string {
  const saved = readHudsonSealedDocument<{ id: string }>(DEVICE_DOC);
  if (saved?.id) return saved.id;
  const id = randomUUID();
  writeHudsonSealedDocument(DEVICE_DOC, { id });
  return id;
}

// ---------------------------------------------------------------------------
// Login. One at a time per server; state survives dev-server hot reloads.
// ---------------------------------------------------------------------------

interface LoginState {
  pending: boolean;
  url?: string;
  error?: string;
  abort?: AbortController;
}

const globalState = globalThis as typeof globalThis & {
  __hudsonChatGPTLogin?: LoginState;
  __hudsonChatGPTRefresh?: Promise<ChatGPTCredential | null>;
};

function loginState(): LoginState {
  return (globalState.__hudsonChatGPTLogin ??= { pending: false });
}

/**
 * Start the sign-in and resolve with the authorize URL once pi-ai's callback
 * listener is up. The login itself finishes in the background when the
 * browser comes back to 127.0.0.1:1455.
 */
export async function startChatGPTSignIn(): Promise<{ url: string }> {
  const state = loginState();
  if (state.pending && state.url) return { url: state.url };

  const abort = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort(new Error('Sign-in timed out'));
  }, LOGIN_TIMEOUT_MS);
  Object.assign(state, { pending: true, url: undefined, error: undefined, abort });

  let resolveUrl!: (url: string) => void;
  let rejectUrl!: (err: unknown) => void;
  const urlReady = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const login = oauth().login(
    {
      signal: abort.signal,
      notify(event) {
        if (event.type === 'auth_url') {
          state.url = event.url;
          resolveUrl(event.url);
        }
      },
      // pi-ai offers a "paste the callback URL" prompt as a fallback. Hudson
      // relies on the loopback callback, so the prompt only ends on abort.
      prompt(prompt) {
        return new Promise<string>((_, reject) => {
          const onAbort = () => reject(new Error('Sign-in cancelled'));
          if (abort.signal.aborted || prompt.signal?.aborted) return onAbort();
          abort.signal.addEventListener('abort', onAbort, { once: true });
          prompt.signal?.addEventListener('abort', onAbort, { once: true });
        });
      },
    },
    { agentName: AGENT_NAME, getDeviceId: deviceId },
  );

  login
    .then((credential) => {
      defaultDeps.writeCredential(credential as unknown as ChatGPTCredential);
      Object.assign(state, { pending: false, url: undefined, error: undefined, abort: undefined });
    })
    .catch((err: unknown) => {
      // pi-ai reports any abort as "Login cancelled"; say why when we know.
      const message = timedOut
        ? 'Sign-in timed out. Click Continue with ChatGPT to try again.'
        : err instanceof Error ? err.message : String(err);
      Object.assign(state, { pending: false, url: undefined, error: message, abort: undefined });
      rejectUrl(err);
    })
    .finally(() => clearTimeout(timeout));

  return { url: await urlReady };
}

export function cancelChatGPTSignIn() {
  loginState().abort?.abort(new Error('Sign-in cancelled'));
}

export function chatGPTStatus(deps: ChatGPTDeps = defaultDeps): ChatGPTStatus {
  const state = loginState();
  let signedIn = false;
  try {
    signedIn = deps.readCredential() !== null;
  } catch {
    signedIn = false;
  }
  return { signedIn, pending: state.pending, url: state.url, error: state.error };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function isRejectedGrant(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /invalid_grant|\((400|401)\)/.test(message);
}

/**
 * A valid access token, refreshing first when it has expired. Refreshes are
 * serialised because each one rotates the refresh token: two at once would
 * leave one of them holding a token OpenAI has already replaced.
 */
export async function chatGPTAccessToken(deps: ChatGPTDeps = defaultDeps): Promise<string | null> {
  const credential = deps.readCredential();
  if (!credential) return null;
  if (deps.now() < credential.expires) return credential.access;

  globalState.__hudsonChatGPTRefresh ??= (async () => {
    try {
      // Another request may have refreshed while this one waited.
      const latest = deps.readCredential();
      if (!latest) return null;
      if (deps.now() < latest.expires) return latest;
      const next = await deps.refresh(latest, AbortSignal.timeout(30_000));
      deps.writeCredential(next);
      return next;
    } catch (err) {
      if (isRejectedGrant(err)) {
        deps.deleteCredential();
        throw new Error('Your ChatGPT sign-in expired. Sign in with ChatGPT again.');
      }
      throw err;
    } finally {
      globalState.__hudsonChatGPTRefresh = undefined;
    }
  })();

  return (await globalState.__hudsonChatGPTRefresh)?.access ?? null;
}

/**
 * Revoke the refresh token at OpenAI, then forget the credential. Local
 * sign-out happens even if revocation fails; `revoked` says whether OpenAI
 * confirmed it, so the UI can point at ChatGPT settings when it did not.
 */
export async function signOutOfChatGPT(deps: ChatGPTDeps = defaultDeps): Promise<{ revoked: boolean }> {
  const credential = deps.readCredential();
  if (!credential) return { revoked: true };
  let revoked = false;
  try {
    const config = (await fetch(OPENID_CONFIGURATION, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json())) as {
      revocation_endpoint?: string;
    };
    if (config.revocation_endpoint) {
      const response = await fetch(config.revocation_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: credential.refresh,
          token_type_hint: 'refresh_token',
          client_id: credential.clientId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      revoked = response.ok;
    }
  } catch {
    revoked = false;
  }
  deps.deleteCredential();
  return { revoked };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

interface ChatGPTModelEntry {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
}

/**
 * The models this ChatGPT account may use, as picker options. Only models
 * pi-ai's registry knows are kept, because chat looks the model up there.
 */
export function chatGPTModelOptions(payload: unknown, registry: AISelectOption[]): AISelectOption[] {
  const entries = (payload as { models?: ChatGPTModelEntry[] } | null)?.models;
  if (!Array.isArray(entries)) throw new Error('Invalid ChatGPT model response');
  const known = new Set(registry.filter((m) => m.provider === 'openai').map((m) => m.value));
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (entry?.visibility !== 'list' || typeof entry.slug !== 'string') return [];
    if (!known.has(entry.slug) || seen.has(entry.slug)) return [];
    seen.add(entry.slug);
    const label = typeof entry.display_name === 'string' ? entry.display_name : entry.slug;
    return [{ value: entry.slug, label, provider: CHATGPT_PROVIDER }];
  });
}

export async function fetchChatGPTModels(accessToken: string): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`ChatGPT model list failed (${response.status})`);
  return response.json();
}
