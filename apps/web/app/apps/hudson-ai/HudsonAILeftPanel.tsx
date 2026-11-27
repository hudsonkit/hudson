'use client';

import type { ReactNode } from 'react';
import { Sparkles } from 'hudsonkit/icons';
import { useHudsonAIApp } from './HudsonAIProvider';
import { useHudsonAIRuntime } from 'hudsonkit/workspace';
import { getHudsonVoiceBehaviorPreset, getHudsonVoiceBehaviorPresetLabel } from 'hudsonkit/workspace';
import { AI_LOCAL_PROVIDER_OPTIONS, AI_MODEL_OPTIONS, AI_PROVIDER_OPTIONS } from '../../lib/ai-models';

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
      <span className="text-[11px] text-right text-foreground/72">{value}</span>
    </div>
  );
}

function getOptionLabel(
  value: string,
  options: Array<{ value: string; label: string }>,
) {
  return options.find(option => option.value === value)?.label ?? value;
}

function formatVoiceProvider(provider: string) {
  if (provider === 'vox') return 'Vox';
  return provider;
}

export function HudsonAILeftPanel() {
  const { resolvedProvider, resolvedModel, settingsSource } = useHudsonAIApp();
  const { voiceSettings } = useHudsonAIRuntime();
  const behaviorPreset = getHudsonVoiceBehaviorPreset(voiceSettings);
  const resolvedProviderLabel = getOptionLabel(resolvedProvider, [...AI_PROVIDER_OPTIONS, ...AI_LOCAL_PROVIDER_OPTIONS]);
  const resolvedModelLabel = getOptionLabel(resolvedModel, AI_MODEL_OPTIONS);
  const voiceProviderLabel = formatVoiceProvider(voiceSettings.replyProvider);

  return (
    <div className="h-full min-h-0 overflow-y-auto frame-scrollbar p-3 space-y-4">
      <div className="rounded-xl border border-border/70 bg-card/72 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-info/30 bg-info/10 text-info">
            <Sparkles size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-foreground/86">Hudson AI</div>
            <div className="truncate text-[10px] font-mono text-muted-foreground">
              {resolvedProviderLabel} / {resolvedModelLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/72 p-3 space-y-3">
        <SectionTitle>Runtime</SectionTitle>
        <div className="divide-y divide-border/60">
          <DetailRow label="AI Provider" value={resolvedProviderLabel} />
          <DetailRow label="AI Model" value={resolvedModelLabel} />
          <DetailRow label="Config Source" value={settingsSource} />
          <DetailRow label="Voice Provider" value={voiceProviderLabel} />
          <DetailRow
            label="Reply Behavior"
            value={getHudsonVoiceBehaviorPresetLabel(behaviorPreset)}
          />
        </div>
        <div className="rounded-lg border border-border/60 bg-background/52 px-2.5 py-2 text-[10px] leading-relaxed text-foreground/62">
          Hudson AI uses a Hudson-wide default and can override it per workspace. Voice workflow stays global to Hudson.
        </div>
      </div>
    </div>
  );
}
