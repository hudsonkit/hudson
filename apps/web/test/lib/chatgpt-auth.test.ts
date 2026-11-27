import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chatGPTAccessToken,
  chatGPTModelOptions,
  signOutOfChatGPT,
  type ChatGPTCredential,
  type ChatGPTDeps,
} from '@/app/api/ai/chatgpt';
import {
  clearHudsonLocalSecretVaultCacheForTests,
  deleteHudsonSealedDocument,
  readHudsonSealedDocument,
  writeHudsonSealedDocument,
} from '@/app/lib/localSecretVault';

function credential(overrides: Partial<ChatGPTCredential> = {}): ChatGPTCredential {
  return {
    type: 'oauth',
    access: 'access-1',
    refresh: 'refresh-1',
    expires: 1_000,
    clientId: 'oaiapp_test',
    scopes: ['openid', 'chatgpt.tokens.use.direct'],
    ...overrides,
  };
}

function memoryDeps(initial: ChatGPTCredential | null, now: number, refresh: ChatGPTDeps['refresh']) {
  let stored = initial;
  const deps: ChatGPTDeps = {
    readCredential: () => stored,
    writeCredential: (next) => { stored = next; },
    deleteCredential: () => { stored = null; },
    refresh,
    now: () => now,
  };
  return { deps, stored: () => stored };
}

describe('ChatGPT tokens', () => {
  it('returns the stored token while it is valid', async () => {
    const refresh = vi.fn();
    const { deps } = memoryDeps(credential({ expires: 2_000 }), 1_000, refresh);
    await expect(chatGPTAccessToken(deps)).resolves.toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns null when not signed in', async () => {
    const { deps } = memoryDeps(null, 1_000, vi.fn());
    await expect(chatGPTAccessToken(deps)).resolves.toBeNull();
  });

  it('refreshes an expired token once, even for concurrent requests, and stores the rotated one', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refresh = vi.fn(async (old: ChatGPTCredential) => {
      await gate;
      return credential({ access: 'access-2', refresh: `${old.refresh}-rotated`, expires: 9_000 });
    });
    const { deps, stored } = memoryDeps(credential({ expires: 500 }), 1_000, refresh);
    const pending = [chatGPTAccessToken(deps), chatGPTAccessToken(deps), chatGPTAccessToken(deps)];
    release();
    await expect(Promise.all(pending)).resolves.toEqual(['access-2', 'access-2', 'access-2']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(stored()?.refresh).toBe('refresh-1-rotated');
  });

  it('forgets the credential and asks to sign in again when OpenAI rejects the refresh token', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('OpenAI OAuth token request failed (400): {"error":"invalid_grant"}');
    });
    const { deps, stored } = memoryDeps(credential({ expires: 500 }), 1_000, refresh);
    await expect(chatGPTAccessToken(deps)).rejects.toThrow(/Sign in with ChatGPT again/);
    expect(stored()).toBeNull();
  });

  it('keeps the credential on a transient refresh failure', async () => {
    const refresh = vi.fn(async () => { throw new Error('fetch failed'); });
    const { deps, stored } = memoryDeps(credential({ expires: 500 }), 1_000, refresh);
    await expect(chatGPTAccessToken(deps)).rejects.toThrow('fetch failed');
    expect(stored()).not.toBeNull();
  });
});

describe('ChatGPT sign-out', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('revokes the refresh token at OpenAI, then forgets it', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('openid-configuration')) {
        return new Response(JSON.stringify({ revocation_endpoint: 'https://auth.openai.com/oauth/revoke' }));
      }
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('token')).toBe('refresh-1');
      expect(body.get('token_type_hint')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('oaiapp_test');
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { deps, stored } = memoryDeps(credential(), 1_000, vi.fn());
    await expect(signOutOfChatGPT(deps)).resolves.toEqual({ revoked: true });
    expect(stored()).toBeNull();
  });

  it('signs out locally even when revocation fails, and says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { deps, stored } = memoryDeps(credential(), 1_000, vi.fn());
    await expect(signOutOfChatGPT(deps)).resolves.toEqual({ revoked: false });
    expect(stored()).toBeNull();
  });
});

describe('ChatGPT models', () => {
  const registry = [
    { value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', provider: 'openai' },
    { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai' },
  ];

  it('keeps listed models that pi-ai can route', () => {
    const options = chatGPTModelOptions(
      {
        models: [
          { slug: 'gpt-6.1-terra', display_name: 'GPT-6.1 Terra', visibility: 'list' },
          { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', visibility: 'hide' },
          { slug: 'gpt-7-preview', display_name: 'GPT-7', visibility: 'list' },
        ],
      },
      registry,
    );
    expect(options).toEqual([{ value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', provider: 'chatgpt' }]);
  });

  it('rejects a malformed response', () => {
    expect(() => chatGPTModelOptions({ data: [] }, registry)).toThrow('Invalid ChatGPT model response');
  });
});

describe('sealed documents', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hudson-sealed-'));
    vi.stubEnv('HUDSON_LOCAL_VAULT_PATH', join(dir, 'hudson-local-vault.json'));
    vi.stubEnv('HUDSON_LOCAL_VAULT_KEY', 'test-key-material');
    clearHudsonLocalSecretVaultCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    clearHudsonLocalSecretVaultCacheForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips encrypted, owner-only, and never in plain text', () => {
    writeHudsonSealedDocument('chatgpt-credential', credential());
    const path = join(dir, 'hudson-chatgpt-credential.sealed.json');
    expect(readFileSync(path, 'utf-8')).not.toContain('refresh-1');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readHudsonSealedDocument<ChatGPTCredential>('chatgpt-credential')?.refresh).toBe('refresh-1');
    deleteHudsonSealedDocument('chatgpt-credential');
    expect(readHudsonSealedDocument('chatgpt-credential')).toBeNull();
  });

  it('rejects document names that could escape the vault folder', () => {
    expect(() => writeHudsonSealedDocument('../x', {})).toThrow('Invalid sealed document name');
  });
});
