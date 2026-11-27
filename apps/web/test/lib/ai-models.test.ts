import { describe, expect, it } from 'vitest';
import {
  defaultModelForProvider,
  modelOptionsForProvider,
  withProviderDefaultModel,
} from '@/app/lib/ai-models';

const catalog = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'openai' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'copilot' },
];

describe('Hudson AI provider/model pairing', () => {
  it('scopes the model picker to the selected provider', () => {
    expect(modelOptionsForProvider(catalog, 'openai', 'gpt-5-mini').map(o => o.value))
      .toEqual(['gpt-4o-mini', 'gpt-5-mini']);
  });

  it('keeps an unlisted current model visible instead of blanking the select', () => {
    expect(modelOptionsForProvider([], 'openai').map(o => o.value)).toEqual(['gpt-4o-mini']);
  });

  it('moves the model to the new provider default when only the provider changes', () => {
    expect(withProviderDefaultModel({ provider: 'openai' }, 'copilot'))
      .toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('leaves explicit models and same-provider patches alone', () => {
    expect(withProviderDefaultModel({ provider: 'openai', model: 'gpt-5-mini' }, 'copilot'))
      .toEqual({ provider: 'openai', model: 'gpt-5-mini' });
    expect(withProviderDefaultModel({ provider: 'openai' }, 'openai')).toEqual({ provider: 'openai' });
    expect(withProviderDefaultModel({ model: 'gpt-5-mini' }, 'openai')).toEqual({ model: 'gpt-5-mini' });
  });

  it('falls back to the copilot default for unknown providers', () => {
    expect(defaultModelForProvider('nope')).toBe('gemini-3-flash-preview');
  });
});
