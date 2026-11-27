import { NextResponse } from 'next/server';
import { registryModelOptions, availableCopilotOptions } from '@/app/lib/ai-model-catalog';
import { fetchCopilotChatModels } from '../copilot-auth';
import { codexModelOptions, codexProviderOption, codexStatus } from '../codex';
import { CHATGPT_PROVIDER, chatGPTAccessToken, chatGPTModelOptions, fetchChatGPTModels } from '../chatgpt';
import { AI_LOCAL_PROVIDER_OPTIONS, type AISelectOption } from '@/app/lib/ai-models';

/** The ChatGPT plan's models, when this install is signed in. */
async function chatGPTOptions(registry: AISelectOption[]): Promise<AISelectOption[]> {
  try {
    const token = await chatGPTAccessToken();
    if (!token) return [];
    return chatGPTModelOptions(await fetchChatGPTModels(token), registry);
  } catch {
    return [];
  }
}

/** Providers that exist only on local Hudson: Codex, and a signed-in ChatGPT plan. */
async function localProviders(registry: AISelectOption[]) {
  const [codex, chatgpt] = await Promise.all([codexStatus(), chatGPTOptions(registry)]);
  const providerOptions: AISelectOption[] = [];
  const options: AISelectOption[] = [];
  if (chatgpt.length > 0) {
    providerOptions.push(AI_LOCAL_PROVIDER_OPTIONS.find(option => option.value === CHATGPT_PROVIDER)!);
    options.push(...chatgpt);
  }
  if (codex.available) {
    providerOptions.push(codexProviderOption());
    options.push(...codexModelOptions(codex.models));
  }
  return { providerOptions, options };
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get('provider') ?? 'copilot';
  const local = await localProviders(registryModelOptions());
  const registry = [...registryModelOptions(), ...local.options];
  const providerOptions = local.providerOptions;
  const fetchedAt = new Date().toISOString();
  if (provider !== 'copilot' && provider !== 'github-copilot') {
    return NextResponse.json({ provider, source: 'registry', fetchedAt, models: registry, options: registry, providerOptions });
  }
  try {
    const copilot = availableCopilotOptions(await fetchCopilotChatModels(), registry);
    const options = [...copilot, ...registry.filter(model => model.provider !== 'copilot')];
    return NextResponse.json({ provider: 'copilot', source: 'live', fetchedAt, models: copilot, options, providerOptions });
  } catch {
    return NextResponse.json({ provider: 'copilot', source: 'registry', fetchedAt, models: registry, options: registry, providerOptions });
  }
}
