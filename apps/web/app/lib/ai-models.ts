export const AI_MODELS_PATH = '/api/ai/models';

export interface AISelectOption {
  value: string;
  label: string;
  provider?: string;
  contextWindow?: number;
}

export interface AIModelPreset extends AISelectOption {
  provider: string;
  model: string;
}

export const AI_PROVIDER_OPTIONS: AISelectOption[] = [
  { label: 'GitHub Copilot', value: 'copilot' },
  { label: 'MiniMax', value: 'minimax' },
  { label: 'GitHub Models', value: 'github' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'X.ai', value: 'xai' },
  { label: 'Groq', value: 'groq' },
  { label: 'Google AI', value: 'google' },
];

// Catalogs are loaded from the server's installed pi-ai registry. Keeping the
// loading state empty prevents stale bundled options from masking new models.
export const AI_MODEL_OPTIONS: AISelectOption[] = [];

export const PI_CLI_PROVIDER_OPTIONS: AISelectOption[] = [
  { label: 'MiniMax', value: 'minimax' },
  { label: 'GitHub Copilot', value: 'github-copilot' },
];

/** Default model per Hudson provider. Shared by the server registry and the pickers. */
export const AI_PROVIDER_DEFAULT_MODELS = {
  minimax: 'MiniMax-M2.7',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  xai: 'grok-4-1-fast',
  github: 'gpt-4o',
  google: 'gemini-2.0-flash',
  copilot: 'gemini-3-flash-preview',
} as const;

export type AIProviderName = keyof typeof AI_PROVIDER_DEFAULT_MODELS;

/** Vault / env key that unlocks each provider (shown in errors and setup hints). */
export const AI_PROVIDER_ENV_KEYS: Record<AIProviderName, string> = {
  minimax: 'MINIMAX_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  github: 'GITHUB_TOKEN',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  copilot: 'GitHub Copilot sign-in',
};

export function defaultModelForProvider(provider: string): string {
  return AI_PROVIDER_DEFAULT_MODELS[provider as AIProviderName] ?? AI_PROVIDER_DEFAULT_MODELS.copilot;
}

/**
 * Models the picker should offer for one provider. A model from another
 * provider would be sent to the wrong API, so the list is scoped. The current
 * value stays listed so the select never shows a blank.
 */
export function modelOptionsForProvider(
  options: AISelectOption[],
  provider: string,
  currentModel?: string,
): AISelectOption[] {
  const scoped = options.filter(option => option.provider === provider);
  const fallback = currentModel || defaultModelForProvider(provider);
  if (scoped.some(option => option.value === fallback)) return scoped;
  return [{ value: fallback, label: fallback, provider }, ...scoped];
}

/**
 * When a settings patch switches provider without naming a model, move the
 * model to the new provider's default so the pair stays routable.
 */
export function withProviderDefaultModel<T extends { provider?: unknown; model?: unknown }>(
  patch: T,
  currentProvider: string,
): T {
  if (typeof patch.provider !== 'string' || patch.provider === currentProvider || patch.model !== undefined) {
    return patch;
  }
  return { ...patch, model: defaultModelForProvider(patch.provider) };
}
