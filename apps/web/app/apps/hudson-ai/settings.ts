import type { AppSettingsConfig } from 'hudsonkit';
import { AI_MODEL_OPTIONS, AI_PROVIDER_OPTIONS, modelOptionsForProvider, type AISelectOption } from '../../lib/ai-models';

export function createHudsonAISettings(
  modelOptions: AISelectOption[] = AI_MODEL_OPTIONS,
  scope?: { provider: string; model?: string },
  localProviderOptions: AISelectOption[] = [],
): AppSettingsConfig {
  const providerOptions = [
    ...AI_PROVIDER_OPTIONS,
    ...localProviderOptions.filter(option => !AI_PROVIDER_OPTIONS.some(known => known.value === option.value)),
  ];
  const options = scope ? modelOptionsForProvider(modelOptions, scope.provider, scope.model) : modelOptions;
  return {
    sections: [
      {
        label: 'AI (Hudson)',
        fields: [
          {
            key: 'provider',
            label: 'Provider',
            description: 'Hudson AI runs through the Pi backend. GitHub Copilot maps to the Pi provider github-copilot. Codex (ChatGPT plan) appears when the Codex CLI is installed and signed in on this machine.',
            type: 'select',
            default: 'copilot',
            options: providerOptions,
          },
          {
            key: 'model',
            label: 'Model',
            description: 'Default model for Hudson-level chat, voice replies, and workspace actions. Changing the provider resets this to that provider\'s default.',
            type: 'select',
            default: 'gemini-3-flash-preview',
            options,
          },
        ],
      },
    ],
  };
}

export const hudsonAISettings: AppSettingsConfig = createHudsonAISettings();
