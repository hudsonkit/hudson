import type { PiAiCompiledToolset } from '@hudsonkit/ai/pi-ai';

// Apps may declare tools for their own UI, never server-side code to execute.
// The host only returns these calls in the stream; the app applies them.
export function compileAppToolset(value: unknown): PiAiCompiledToolset | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid app toolset');
  const { system, tools } = value as Record<string, unknown>;
  if (typeof system !== 'string' || system.length > 200_000 || !tools || typeof tools !== 'object' || Array.isArray(tools)) {
    throw new Error('Invalid app toolset');
  }
  const entries = Object.entries(tools);
  if (entries.length > 64) throw new Error('Too many app tools');
  const compiled: PiAiCompiledToolset['tools'] = Object.create(null);
  for (const [name, raw] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid app tool');
    }
    const { description, inputSchema } = raw as Record<string, unknown>;
    if (typeof description !== 'string' || !inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
      throw new Error('Invalid app tool schema');
    }
    compiled[name] = { description, inputSchema, execute: async () => ({ applied: true }) };
  }
  return { system, tools: compiled };
}

export function appCredentials(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const credentials: Record<string, string> = {};
  for (const provider of ['openai', 'openrouter', 'opencode', 'groq', 'anthropic', 'google', 'xai', 'deepseek', 'openai-codex']) {
    const key = (value as Record<string, unknown>)[provider];
    if (typeof key === 'string' && key.trim() && key.length <= 8192) credentials[provider] = key.trim();
  }
  return credentials;
}
