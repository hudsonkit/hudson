'use client';

import { useEffect, useState } from 'react';
import { AI_MODELS_PATH, type AISelectOption } from './ai-models';

/** Dispatch on window to reload the catalog now (e.g. after a provider sign-in). */
export const AI_MODELS_REFRESH_EVENT = 'hudson:ai-models-refresh';

export function useAIModelOptions() {
  const [modelOptions, setModelOptions] = useState<AISelectOption[]>([]);
  // Providers the local server adds when a harness is installed (Codex). The
  // hosted site never reports any, so they stay hidden there.
  const [localProviderOptions, setLocalProviderOptions] = useState<AISelectOption[]>([]);
  const [source, setSource] = useState<'registry' | 'live'>('registry');

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(AI_MODELS_PATH, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && Array.isArray(data.options)) {
          setModelOptions(data.options);
          setLocalProviderOptions(Array.isArray(data.providerOptions) ? data.providerOptions : []);
          setSource(data.source === 'live' ? 'live' : 'registry');
        }
      } catch { /* Retain the last successful catalog until the next refresh. */ }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(AI_MODELS_REFRESH_EVENT, refresh);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener(AI_MODELS_REFRESH_EVENT, refresh);
    };
  }, []);

  return { modelOptions, localProviderOptions, source };
}
