'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
import type { WorkspaceAppConfig } from 'hudsonkit';
import { Network } from 'hudsonkit/icons';
import {
  HudNetworkPanel,
  installHudsonFetchCapture,
} from 'hudsonkit/observability';
import { TerminalContent } from '../apps/terminal/TerminalContent';
import { useHudsonAISettings } from '../apps/hudson-ai/useHudsonAISettings';
import { createHudsonAISettings } from '../apps/hudson-ai/settings';
import { AI_MODELS_PATH } from './ai-models';
import { useAIModelOptions } from './useAIModelOptions';
import type {
  AppSettingsEntry,
  WorkspaceDeveloperTool,
  WorkspaceShellEnvironment,
} from 'hudsonkit/workspace';

/**
 * Hudson's concrete bindings for the host WorkspaceShell's injectable surfaces.
 *
 * This lives in app/ (not the kit) because it imports Hudson's own apps. The
 * shell stays app-agnostic and reaches these only through the `environment`
 * prop — which is what lets the shell move into hudsonkit while Hudson keeps
 * supplying its apps. As more reaches are inverted (intents, service registry,
 * /api endpoints) they get bound here.
 */
function useHudsonAISettingsEntry(
  config: WorkspaceAppConfig | null,
  workspaceId: string,
): AppSettingsEntry | null {
  const { modelOptions } = useAIModelOptions();
  const settingsConfig = useMemo(() => createHudsonAISettings(modelOptions), [modelOptions]);
  const scoped = useHudsonAISettings(workspaceId, settingsConfig);
  const provider = String(scoped.resolvedSettings.provider || 'copilot');
  const model = String(scoped.resolvedSettings.model || '');
  // The form shows only models the selected provider can route.
  const scopedConfig = useMemo(
    () => createHudsonAISettings(modelOptions, { provider, model }),
    [model, modelOptions, provider],
  );
  return {
    appId: config?.app.id ?? 'hudson-ai',
    appName: config?.app.name ?? 'Hudson AI',
    config: scopedConfig,
    values: scoped.resolvedSettings,
    onUpdate: scoped.updateWorkspaceOverride,
  };
}

function useHudsonDeveloperTools(): readonly WorkspaceDeveloperTool[] {
  return useMemo(() => process.env.NODE_ENV === 'development' ? [
    {
      id: 'network',
      label: 'Network',
      icon: <Network size={13} />,
      render: () => <HudsonNetworkTool />,
    },
  ] : [], []);
}

function HudsonNetworkTool() {
  const [recording, setRecording] = useState(false);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !recording) return;
    return installHudsonFetchCapture();
  }, [recording]);

  return (
    <HudNetworkPanel
      recording={recording}
      onRecordingChange={setRecording}
    />
  );
}

export const hudsonShellEnvironment: WorkspaceShellEnvironment = {
  // Voice runs on Vox, a local macOS runtime: offer it where that can exist
  // (local dev), not to visitors on the public site.
  voice: 'local-only',
  routes: {
    agentActions: '/api/agent-actions',
    aiChat: '/api/ai/chat',
    aiModels: AI_MODELS_PATH,
    apiProxy: '/api/proxy',
    fetchImage: '/api/fetch-image',
    imageGeneration: '/api/ai/generate-image',
    localEnvironment: '/api/settings/environment',
    pipes: '/api/pipes',
    pipeEvents: '/api/pipes/stream',
    relayUpload: '/api/relay/upload',
    services: '/api/services',
    serviceExecute: '/api/services/execute',
    speech: '/v1/audio/speech',
    traces: '/api/traces',
    voiceApiBase: '/api/hudson-voice',
    voices: '/v1/voices',
    workspaceDecor: '/api/workspace-decor',
    workspaceState: '/api/workspace-state',
  },
  renderTerminal: (opts) => <TerminalContent {...opts} />,
  useHudsonAISettingsEntry,
  useDeveloperTools: useHudsonDeveloperTools,
};
