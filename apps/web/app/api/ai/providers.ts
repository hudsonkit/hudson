/**
 * Hudson AI provider registry.
 *
 * Uses the same pattern as @arach/ai but imports from Hudson's own
 * AI SDK packages to avoid version mismatches with the ai-sdk/react hooks.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { readCachedCopilotChatToken } from './copilot-auth';
import { loadHudsonLocalSecrets } from '@/app/lib/localSecretVault';
import { AI_PROVIDER_DEFAULT_MODELS, AI_PROVIDER_ENV_KEYS } from '@/app/lib/ai-models';

export type ProviderName = 'minimax' | 'anthropic' | 'openai' | 'groq' | 'xai' | 'github' | 'google' | 'copilot';

export const DEFAULT_MODELS: Record<ProviderName, string> = AI_PROVIDER_DEFAULT_MODELS;

interface CredentialStore {
  minimax?: string;
  anthropic?: string;
  openai?: string;
  groq?: string;
  elevenlabs?: string;
  xai?: string;
  github?: string;
  google?: string;
  copilot?: string;
}

let _cachedCreds: CredentialStore | null = null;

export function loadCredentials(): CredentialStore {
  if (_cachedCreds) {
    const cachedCopilotToken = readCachedCopilotChatToken();
    if (cachedCopilotToken && _cachedCreds.copilot !== cachedCopilotToken.token) {
      _cachedCreds = { ..._cachedCreds, copilot: cachedCopilotToken.token };
    }
    return _cachedCreds;
  }
  const creds: CredentialStore = {};
  const vault = (() => {
    try {
      return loadHudsonLocalSecrets();
    } catch {
      return {};
    }
  })();
  const getSecret = (key: string) => vault[key] || process.env[key];

  if (getSecret('MINIMAX_API_KEY')) creds.minimax = getSecret('MINIMAX_API_KEY');
  if (getSecret('ANTHROPIC_API_KEY')) creds.anthropic = getSecret('ANTHROPIC_API_KEY');
  if (getSecret('OPENAI_API_KEY')) creds.openai = getSecret('OPENAI_API_KEY');
  if (getSecret('GROQ_API_KEY')) creds.groq = getSecret('GROQ_API_KEY');
  if (getSecret('ELEVENLABS_API_KEY')) creds.elevenlabs = getSecret('ELEVENLABS_API_KEY');
  if (getSecret('XAI_API_KEY')) creds.xai = getSecret('XAI_API_KEY');
  if (getSecret('GITHUB_TOKEN')) creds.github = getSecret('GITHUB_TOKEN');
  if (getSecret('GOOGLE_GENERATIVE_AI_API_KEY')) creds.google = getSecret('GOOGLE_GENERATIVE_AI_API_KEY');

  // Copilot chat token. The model catalog route refreshes this cache from the
  // GitHub OAuth token, so chat requests should prefer it over raw OAuth.
  const copilotChatToken = readCachedCopilotChatToken();
  if (copilotChatToken) creds.copilot = copilotChatToken.token;

  // Copilot OAuth token — fallback from OpenCode's auth store
  if (!creds.copilot) {
    const authPath = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
    if (existsSync(authPath)) {
      try {
        const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
        const cp = auth['github-copilot'];
        if (cp?.access) creds.copilot = cp.access;
      } catch { /* ignore */ }
    }
  }

  const latticesConfig = join(homedir(), '.lattices', 'inference.json');
  if (existsSync(latticesConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(latticesConfig, 'utf-8'));
      if (cfg.keys) {
        for (const k of Object.keys(DEFAULT_MODELS) as (keyof CredentialStore)[]) {
          if (!creds[k] && cfg.keys[k]) creds[k] = cfg.keys[k];
        }
      }
    } catch { /* ignore */ }
  }

  _cachedCreds = creds;
  return creds;
}

export function clearCredentialCache() { _cachedCreds = null; }

export function availableProviders(): ProviderName[] {
  const creds = loadCredentials();
  return (Object.keys(DEFAULT_MODELS) as ProviderName[]).filter(k => !!creds[k]);
}

function getModel(provider: ProviderName, modelId: string) {
  const creds = loadCredentials();
  switch (provider) {
    case 'minimax': {
      const minimax = createOpenAI({ baseURL: 'https://api.minimax.io/v1', apiKey: creds.minimax });
      return minimax.chat(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: creds.anthropic });
      return anthropic(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey: creds.openai });
      return openai(modelId);
    }
    case 'groq': {
      const groq = createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: creds.groq });
      return groq(modelId);
    }
    case 'xai': {
      const xai = createOpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: creds.xai });
      return xai(modelId);
    }
    case 'github': {
      // GitHub Models API — accessible with Copilot subscription via GITHUB_TOKEN
      // Supports: gemini-2.0-flash, gpt-4o, gpt-4o-mini, Llama, Cohere, etc.
      const gh = createOpenAI({
        baseURL: 'https://models.inference.ai.azure.com',
        apiKey: creds.github,
      });
      return gh.chat(modelId);
    }
    case 'google': {
      // Google AI Studio direct — needs GOOGLE_GENERATIVE_AI_API_KEY
      const google = createOpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: creds.google,
      });
      return google.chat(modelId);
    }
    case 'copilot': {
      // GitHub Copilot API — uses the short-lived Copilot chat token when the
      // local cache has been refreshed, with the older OpenCode token fallback.
      // The visible model picker is kept in app/lib/ai-models.ts and refreshed
      // at runtime from /api/ai/models.
      const copilot = createOpenAI({
        baseURL: 'https://api.githubcopilot.com',
        apiKey: creds.copilot,
        headers: { 'Copilot-Integration-Id': 'vscode-chat' },
      });
      return copilot.chat(modelId);
    }
  }
}

export function resolveModel(provider?: string, model?: string) {
  const p = (provider || 'copilot') as ProviderName;
  const m = model || DEFAULT_MODELS[p] || DEFAULT_MODELS.copilot;
  const creds = loadCredentials();
  if (!creds[p]) {
    const available = availableProviders();
    throw new Error(
      `No API key for provider "${p}". Add ${AI_PROVIDER_ENV_KEYS[p] ?? `${p.toUpperCase()}_API_KEY`} under Hudson AI → Environment Credentials (or .env.local / ~/.lattices/inference.json). Available: ${available.length > 0 ? available.join(', ') : 'none'}`,
    );
  }
  return getModel(p, m);
}
