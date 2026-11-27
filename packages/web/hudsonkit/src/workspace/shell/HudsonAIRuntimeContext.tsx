'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { HudsonWorkspace } from '../../index';
import type { VoiceSettings, HudsonSettings } from '../settings/types';

export interface HudsonAIWorkspaceSummary {
  id: string;
  name: string;
  description?: string;
  mode: 'canvas' | 'panel';
  focusedAppId: string;
  visibleAppIds: string[];
  disabledAppIds: string[];
  availableWorkspaces: Array<{ id: string; name: string; current: boolean }>;
}

export interface HudsonAIWorkspaceCatalogEntry {
  id: string;
  name: string;
  description?: string;
  mode: 'canvas' | 'panel';
  current: boolean;
  defaultFocusedAppId?: string;
  apps: Array<{
    id: string;
    name: string;
    description?: string;
    agentContext?: string;
    mode: 'canvas' | 'panel';
    canvasMode: 'native' | 'windowed';
    services: Array<{ serviceId: string; optional?: boolean; reason?: string }>;
  }>;
}

export interface HudsonAICommandSummary {
  id: string;
  label: string;
  shortcut?: string;
  scope: 'shell' | 'service' | 'app';
  appId?: string;
  appName?: string;
  description?: string;
}

export interface HudsonAIIntentSummary {
  appId: string;
  appName: string;
  commandId: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  shortcut?: string;
  dangerous?: boolean;
  paramsCount: number;
}

export interface HudsonAIAppSettingsFieldSummary {
  key: string;
  label: string;
  type: string;
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  current: string | number | boolean | undefined;
}

export interface HudsonAIAppSettingsSummary {
  appId: string;
  appName: string;
  sections: Array<{
    label: string;
    fields: HudsonAIAppSettingsFieldSummary[];
  }>;
}

export interface HudsonAIAppCapability {
  id: string;
  name: string;
  description?: string;
  agentContext?: string;
  mode: 'canvas' | 'panel';
  canvasMode: 'native' | 'windowed';
  visible: boolean;
  disabled: boolean;
  focused: boolean;
  ports?: {
    inputs?: Array<{ id: string; name?: string; dataType?: string; description?: string }>;
    outputs?: Array<{ id: string; name?: string; dataType?: string; description?: string }>;
  };
  tools: Array<{ id: string; name: string }>;
  status: { label: string; color: string } | null;
  activeToolHint: string | null;
  services: Array<{ serviceId: string; optional?: boolean; reason?: string }>;
}

export interface HudsonAIServiceSummary {
  id: string;
  name: string;
  description?: string;
  version?: string;
  status: string;
  error?: string;
}

export interface HudsonAIPipeSummary {
  id: string;
  name: string;
  enabled: boolean;
  source: { appId: string; portId: string };
  sink: { appId: string; portId: string };
  lastPushedAt?: number;
}

export interface HudsonAIPortCatalogEntry {
  appId: string;
  appName: string;
  outputs: Array<{ id: string; name?: string; dataType?: string; description?: string }>;
  inputs: Array<{ id: string; name?: string; dataType?: string; description?: string }>;
}

export interface HudsonAIToolContext {
  workspace: HudsonAIWorkspaceSummary;
  workspaces: HudsonAIWorkspaceCatalogEntry[];
  apps: HudsonAIAppCapability[];
  commands: HudsonAICommandSummary[];
  intents: HudsonAIIntentSummary[];
  appSettings: HudsonAIAppSettingsSummary[];
  shellSettings: HudsonSettings;
  services: HudsonAIServiceSummary[];
  pipes: HudsonAIPipeSummary[];
  portCatalog: HudsonAIPortCatalogEntry[];
  environment: {
    manageable: boolean;
    path: string;
    vaultPath?: string;
  };
}

export interface HudsonAIRuntimeData {
  workspace: HudsonWorkspace;
  onToolCall: (name: string, args: Record<string, unknown>) => void | Promise<void>;
  voiceSettings: VoiceSettings;
  voiceTriggerNonce: number;
  /** False when the host can't run voice capture (e.g. a public deployment). */
  voiceEnabled?: boolean;
  toolContext: HudsonAIToolContext;
  queueConsolePrompt: (text: string, options?: { submit?: boolean }) => void;
  openWorkspaceSettings: (tab?: 'overview' | 'settings' | 'environment') => void;
}

const HudsonAIRuntimeContext = createContext<HudsonAIRuntimeData | null>(null);

export function HudsonAIRuntimeProvider({
  value,
  children,
}: {
  value: HudsonAIRuntimeData;
  children: ReactNode;
}) {
  return (
    <HudsonAIRuntimeContext.Provider value={value}>
      {children}
    </HudsonAIRuntimeContext.Provider>
  );
}

export function useHudsonAIRuntime() {
  const ctx = useContext(HudsonAIRuntimeContext);
  if (!ctx) throw new Error('useHudsonAIRuntime must be used within HudsonAIRuntimeProvider');
  return ctx;
}
