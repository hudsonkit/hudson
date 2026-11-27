'use client';

// ---------------------------------------------------------------------------
// Recorder: the activity half of the tabs demo (HUD-015 §13).
//
// A recording is an activity: a host owns it, and a tab only views it by
// ref. Closing the tab never stops it; the status-bar indicator keeps it in
// reach and can open a tab for it again.
//
// The host here is simulated inside the page so the demo runs on the web.
// A real host is a separate process (a menu-bar agent, a daemon) reached
// through the platform adapter's bridge, and survives reloading the page.
// ---------------------------------------------------------------------------
import { createElement, useEffect, type ReactNode } from 'react';
import type { ActivityRef, ActivitySnapshot, HudsonApp, PlatformActivityBridge } from 'hudsonkit';
import { ActivityControls, useActivity, useTab } from 'hudsonkit/workspace';
import { Radio } from 'hudsonkit/icons';

interface Take {
  id: string;
  title: string;
  state: ActivitySnapshot['state'];
  /** Seconds recorded before the current run. */
  banked: number;
  /** When the current run started (ms), if running. */
  since: number | null;
}

function createDemoRecordingHost(): PlatformActivityBridge & { start(): string } {
  const takes = new Map<string, Take>();
  const listeners = new Set<(s: ActivitySnapshot) => void>();
  let counter = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const position = (t: Take) => t.banked + (t.since ? (Date.now() - t.since) / 1000 : 0);
  const snapshot = (t: Take): ActivitySnapshot => ({
    ref: { kind: 'recording', id: t.id },
    state: t.state,
    lifetime: 'host',
    title: t.title,
    progress: { position: position(t) },
    controls: t.state === 'running' ? ['pause', 'stop'] : t.state === 'paused' ? ['resume', 'stop'] : [],
  });
  const publish = (t: Take) => {
    const s = snapshot(t);
    for (const l of listeners) l(s);
  };
  const tick = () => {
    const live = [...takes.values()].filter((t) => t.state === 'running');
    for (const t of live) publish(t);
    if (live.length === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
  const ensureTicker = () => {
    if (!ticker) ticker = setInterval(tick, 1000);
  };

  return {
    start() {
      counter += 1;
      const id = `take-${Date.now().toString(36)}-${counter}`;
      const take: Take = { id, title: `Take ${counter}`, state: 'running', banked: 0, since: Date.now() };
      takes.set(id, take);
      publish(take);
      ensureTicker();
      return id;
    },
    async list() {
      return [...takes.values()].map(snapshot);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async send(ref: ActivityRef, command: string) {
      const t = takes.get(ref.id);
      if (!t) throw new Error(`No recording ${ref.id}`);
      if (command === 'pause' && t.state === 'running') {
        t.banked = position(t);
        t.since = null;
        t.state = 'paused';
      } else if (command === 'resume' && t.state === 'paused') {
        t.since = Date.now();
        t.state = 'running';
        ensureTicker();
      } else if (command === 'stop' && (t.state === 'running' || t.state === 'paused')) {
        t.banked = position(t);
        t.since = null;
        t.state = 'ended';
      } else {
        throw new Error(`Can't ${command} a ${t.state} recording`);
      }
      publish(t);
    },
  };
}

/** The demo's simulated host. Passed to the shell as its activity bridge. */
export const demoRecordingHost = createDemoRecordingHost();

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function RecorderContent() {
  const tab = useTab();
  const id = (tab.params as { recordingId?: string } | undefined)?.recordingId;
  const ref = id ? { kind: 'recording', id } : null;
  const snapshot = useActivity(ref, demoRecordingHost);
  const { setTitle } = tab;

  // The strip's status dot comes from the activity (via activityRef), not from here.
  useEffect(() => setTitle(snapshot?.title ?? 'New recording'), [setTitle, snapshot?.title]);

  if (!ref) {
    return (
      <Centered>
        <p className="max-w-[34ch] text-center text-[11px] leading-relaxed text-muted-foreground">
          A recording belongs to its host, not to this tab. Close the tab while it runs and it keeps going; the status bar
          still shows it.
        </p>
        <button
          type="button"
          onClick={() => tab.setParams({ recordingId: demoRecordingHost.start() })}
          className="rounded border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Start recording
        </button>
      </Centered>
    );
  }

  if (!snapshot) {
    return (
      <Centered>
        <p className="text-[11px] text-muted-foreground">This recording isn’t on the host any more.</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="font-mono text-[40px] font-light tabular-nums tracking-tight text-foreground">
        {clock(snapshot.progress?.position ?? 0)}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {snapshot.state === 'ended' ? 'Saved' : snapshot.state}
      </div>
      <ActivityControls snapshot={snapshot} bridge={demoRecordingHost} />
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6">{children}</div>;
}

const Passthrough = ({ children }: { children: ReactNode }) => <>{children}</>;
const READY = { label: 'READY', color: 'emerald' as const };

export const recorderApp: HudsonApp = {
  id: 'tabs-recorder',
  name: 'Recorder',
  mode: 'panel',
  multiInstance: 'spawnable',
  icon: createElement(Radio, { size: 12 }),
  tab: {
    glyph: '●',
    // The simulated host lives in this page, so its takes don't survive a reload.
    persists: false,
    reuseKey: (p) => (p as { recordingId?: string } | undefined)?.recordingId ?? null,
    activityRef: (p) => {
      const id = (p as { recordingId?: string } | undefined)?.recordingId;
      return id ? { kind: 'recording', id } : null;
    },
    paramsForActivity: (ref) => (ref.kind === 'recording' ? { recordingId: ref.id } : null),
  },
  Provider: Passthrough,
  slots: { Content: RecorderContent },
  hooks: { useCommands: () => [], useStatus: () => READY },
};
