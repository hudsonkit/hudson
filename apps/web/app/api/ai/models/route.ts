import { NextResponse } from 'next/server';
import { registryModelOptions, availableCopilotOptions } from '@/app/lib/ai-model-catalog';
import { fetchCopilotChatModels } from '../copilot-auth';
import { codexModelOptions, codexProviderOption, codexStatus } from '../codex';

/** Providers that exist only where a local harness is installed (Codex). */
async function localProviders() {
  const codex = await codexStatus();
  if (!codex.available) return { providerOptions: [], options: [] };
  return { providerOptions: [codexProviderOption()], options: codexModelOptions(codex.models) };
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get('provider') ?? 'copilot';
  const local = await localProviders();
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
