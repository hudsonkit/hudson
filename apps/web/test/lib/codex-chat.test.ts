import { describe, expect, it } from 'vitest';
import { toCodexTurn, codexModelOptions } from '@/app/api/ai/codex';
import { createHudsonAISettings } from '@/app/apps/hudson-ai/settings';
import { defaultModelForProvider, withProviderDefaultModel } from '@/app/lib/ai-models';

function providerValues(localProviders = [] as { value: string; label: string }[]) {
  const config = createHudsonAISettings([], undefined, localProviders);
  const field = config.sections[0].fields.find((f) => f.key === 'provider') as { options: { value: string }[] };
  return field.options.map((o) => o.value);
}

describe('Codex provider', () => {
  it('splits UI messages into history and the new user input', () => {
    const { history, input } = toCodexTurn([
      { role: 'user', parts: [{ type: 'text', text: 'What is 17 times 23?' }] },
      { role: 'assistant', parts: [{ type: 'text', text: '391' }, { type: 'step-start' }] },
      { role: 'assistant', parts: [] },
      { role: 'user', parts: [{ type: 'text', text: 'Add 9.' }] },
    ]);
    expect(input).toBe('Add 9.');
    expect(history).toEqual([
      { role: 'user', content: 'What is 17 times 23?' },
      { role: 'assistant', content: '391' },
    ]);
  });

  it('returns no input when the last message is not from the user', () => {
    expect(toCodexTurn([{ role: 'assistant', content: 'hi' }]).input).toBe('');
  });

  it('is offered only when the local server reports it', () => {
    expect(providerValues()).not.toContain('codex');
    expect(providerValues([{ value: 'codex', label: 'Codex (ChatGPT plan)' }])).toContain('codex');
    // A local option never duplicates a built-in provider.
    expect(providerValues([{ value: 'openai', label: 'OpenAI' }]).filter((v) => v === 'openai')).toHaveLength(1);
  });

  it('maps Codex models to Codex-scoped options and resets the model on switch', () => {
    expect(codexModelOptions([{ harness: 'codex', model: 'gpt-6.1-terra', name: 'GPT-6.1 Terra' }])).toEqual([
      { value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', provider: 'codex' },
    ]);
    expect(withProviderDefaultModel({ provider: 'codex' }, 'copilot')).toEqual({
      provider: 'codex',
      model: defaultModelForProvider('codex'),
    });
  });
});
