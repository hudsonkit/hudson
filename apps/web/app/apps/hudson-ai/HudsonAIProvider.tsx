'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { AppSettingsConfig, AppSettingsValues } from 'hudsonkit';
import { HUDSON_AI_PROMPT_PRESETS, type HudsonAIPromptPreset } from './catalog';
import { createHudsonAISettings } from './settings';
import { useActiveWorkspace } from 'hudsonkit/workspace';
import { useHudsonAISettings } from './useHudsonAISettings';
import { useAIModelOptions } from '../../lib/useAIModelOptions';

interface HudsonAIContextValue {
  resolvedSettings: AppSettingsValues;
  globalSettings: AppSettingsValues;
  updateGlobalSettings: (patch: Partial<AppSettingsValues>) => void;
  resetGlobalSettings: () => void;
  workspaceOverrideSettings: Partial<AppSettingsValues>;
  hasWorkspaceOverride: boolean;
  enableWorkspaceOverride: () => void;
  updateWorkspaceOverride: (patch: Partial<AppSettingsValues>) => void;
  clearWorkspaceOverride: () => void;
  settingsConfig: AppSettingsConfig;
  promptPresets: HudsonAIPromptPreset[];
  resolvedProvider: string;
  resolvedModel: string;
  settingsSource: 'Hudson Default' | 'Workspace Override';
}

const HudsonAIContext = createContext<HudsonAIContextValue | null>(null);

export function useHudsonAIApp() {
  const ctx = useContext(HudsonAIContext);
  if (!ctx) throw new Error('useHudsonAIApp must be used inside HudsonAIProvider');
  return ctx;
}

export function HudsonAIProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useActiveWorkspace();
  const { modelOptions, localProviderOptions } = useAIModelOptions();
  const settingsConfig = useMemo(
    () => createHudsonAISettings(modelOptions, undefined, localProviderOptions),
    [localProviderOptions, modelOptions],
  );
  const {
    resolvedSettings,
    globalSettings,
    updateGlobalSettings,
    resetGlobalSettings,
    workspaceOverrideSettings,
    hasWorkspaceOverride,
    enableWorkspaceOverride,
    updateWorkspaceOverride,
    clearWorkspaceOverride,
  } = useHudsonAISettings(workspaceId, settingsConfig);

  const value = useMemo<HudsonAIContextValue>(() => ({
    resolvedSettings,
    globalSettings,
    updateGlobalSettings,
    resetGlobalSettings,
    workspaceOverrideSettings,
    hasWorkspaceOverride,
    enableWorkspaceOverride,
    updateWorkspaceOverride,
    clearWorkspaceOverride,
    settingsConfig,
    promptPresets: HUDSON_AI_PROMPT_PRESETS,
    resolvedProvider: String(resolvedSettings.provider || 'copilot'),
    resolvedModel: String(resolvedSettings.model || 'gemini-3-flash-preview'),
    settingsSource: hasWorkspaceOverride ? 'Workspace Override' : 'Hudson Default',
  }), [
    clearWorkspaceOverride,
    enableWorkspaceOverride,
    globalSettings,
    hasWorkspaceOverride,
    resetGlobalSettings,
    resolvedSettings,
    settingsConfig,
    updateGlobalSettings,
    updateWorkspaceOverride,
    workspaceOverrideSettings,
  ]);

  return (
    <HudsonAIContext.Provider value={value}>
      {children}
    </HudsonAIContext.Provider>
  );
}
