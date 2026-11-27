'use client';

// ---------------------------------------------------------------------------
// Tabs demo apps (HUD-015 delivery step 4). Small on purpose: each one shows
// one part of the tab contract.
//
// - Notes: restores from params, titles itself from its first line.
// - Stopwatch: session work. Holds its tab while running, keeps counting
//   while hidden (hidden is not paused).
// - Preview: a web guest that opens in the right dock, reuses by URL and
//   sets a favicon. Moving it never reloads the frame.
// - Console: lives in the bottom dock and drives everything through useTabs.
// ---------------------------------------------------------------------------
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type { HudsonApp, HudsonWorkspace, OpenTabRequest, OpenTabPlacement } from 'hudsonkit';
import { usePersistentState } from 'hudsonkit';
import { useTab, useTabs } from 'hudsonkit/workspace';
import { Clock, FileText, Globe, Terminal } from 'hudsonkit/icons';

const Passthrough = ({ children }: { children: ReactNode }) => <>{children}</>;
const READY = { label: 'READY', color: 'emerald' as const };
const noCommands = () => [];
const ready = () => READY;

// --- Notes -----------------------------------------------------------------

function NotesContent() {
  const tab = useTab();
  // usePersistentState is scoped per tab instance automatically.
  const [text, setText] = usePersistentState('note', '');
  const { setTitle } = tab;
  useEffect(() => {
    const first = text.split('\n').find((l) => l.trim())?.trim();
    setTitle(first ? first.slice(0, 40) : 'Untitled note');
  }, [setTitle, text]);
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Write something. The first line becomes the tab title."
      aria-label="Note"
      className="h-full w-full resize-none bg-transparent p-5 font-mono text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
    />
  );
}

export const notesApp: HudsonApp = {
  id: 'tabs-notes',
  name: 'Notes',
  mode: 'panel',
  multiInstance: 'spawnable',
  icon: createElement(FileText, { size: 12 }),
  tab: { glyph: '¶' },
  Provider: Passthrough,
  slots: { Content: NotesContent },
  hooks: { useCommands: noCommands, useStatus: ready },
};

// --- Stopwatch ---------------------------------------------------------------

function format(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`;
}

function StopwatchContent() {
  const { visible, holdWork, onClose, setTitle } = useTab();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ticksWhileHidden, setTicksWhileHidden] = useState(0);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(0);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    const release = holdWork('The stopwatch');
    const id = setInterval(() => {
      setElapsed(baseRef.current + performance.now() - (startRef.current ?? 0));
      if (!visibleRef.current) setTicksWhileHidden((n) => n + 1);
    }, 100);
    return () => {
      clearInterval(id);
      baseRef.current += performance.now() - (startRef.current ?? 0);
      release();
    };
  }, [holdWork, running]);

  useEffect(() => setTitle(running ? `Stopwatch ${format(elapsed).slice(0, 5)}` : 'Stopwatch'), [elapsed, running, setTitle]);
  useEffect(() => onClose(() => console.info('[tabs-demo] stopwatch closed by the user')), [onClose]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 font-mono">
      <div className="text-[40px] font-light tabular-nums tracking-tight text-foreground">{format(elapsed)}</div>
      <div className="flex gap-2">
        <DemoButton onClick={() => setRunning((r) => !r)} primary={!running}>
          {running ? 'Stop' : 'Start'}
        </DemoButton>
        <DemoButton
          onClick={() => {
            setRunning(false);
            baseRef.current = 0;
            setElapsed(0);
            setTicksWhileHidden(0);
          }}
        >
          Reset
        </DemoButton>
      </div>
      <p className="max-w-[40ch] text-center text-[11px] leading-relaxed text-muted-foreground">
        While it runs, closing this tab asks first. Switch away and back: it kept counting
        {ticksWhileHidden > 0 ? ` (${ticksWhileHidden} ticks while hidden)` : ''}.
      </p>
    </div>
  );
}

export const stopwatchApp: HudsonApp = {
  id: 'tabs-stopwatch',
  name: 'Stopwatch',
  mode: 'panel',
  multiInstance: 'spawnable',
  icon: createElement(Clock, { size: 12 }),
  tab: { glyph: '◷', persists: false },
  Provider: Passthrough,
  slots: { Content: StopwatchContent },
  hooks: { useCommands: noCommands, useStatus: ready },
};

// --- Preview -------------------------------------------------------------------

interface PreviewParams {
  url: string;
}

function PreviewContent() {
  const { params, setIcon, setTitle } = useTab();
  const url = (params as PreviewParams | undefined)?.url ?? '/demo/side-nav';
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    setTitle(url === '/demo/side-nav' ? 'Side nav demo' : url);
    setIcon('/favicon.ico');
  }, [setIcon, setTitle, url]);
  return (
    <div className="relative h-full w-full">
      <iframe src={url} title={`Preview of ${url}`} className="h-full w-full border-0 bg-background" onLoad={() => setLoads((n) => n + 1)} />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
        loaded {loads}×
      </div>
    </div>
  );
}

export const previewApp: HudsonApp = {
  id: 'tabs-preview',
  name: 'Preview',
  mode: 'panel',
  multiInstance: 'spawnable',
  icon: createElement(Globe, { size: 12 }),
  tab: {
    glyph: '◎',
    defaultPlacement: { dock: 'right' },
    reuseKey: (p) => (p as PreviewParams | undefined)?.url ?? '/demo/side-nav',
  },
  Provider: Passthrough,
  slots: { Content: PreviewContent },
  hooks: { useCommands: noCommands, useStatus: ready },
};

// --- Console ---------------------------------------------------------------------

function ConsoleContent() {
  const tabs = useTabs();
  const self = useTab();
  return (
    <div className="flex h-full flex-col font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <DemoButton onClick={() => tabs.open({ appId: 'tabs-notes' })}>New note</DemoButton>
        <DemoButton onClick={() => tabs.open({ appId: 'tabs-stopwatch' }, { placement: 'right' })}>Stopwatch → split</DemoButton>
        <DemoButton onClick={() => tabs.open({ appId: 'tabs-preview', params: { url: '/demo/side-nav' } }, { reuse: true })}>
          Preview (reuse)
        </DemoButton>
        <DemoButton onClick={() => tabs.open({ appId: 'tabs-preview', params: { url: '/demo/side-nav' } }, { reuse: true, inactive: true })}>
          …in background
        </DemoButton>
        <DemoButton onClick={() => tabs.reopen()}>Reopen closed</DemoButton>
      </div>
      <ol className="min-h-0 flex-1 overflow-auto px-3 py-2" aria-label="Open tabs">
        {tabs.tabs.map((t) => (
          <li key={t.instanceId}>
            <button
              type="button"
              onClick={() => tabs.focus(t.instanceId)}
              className={`flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5 text-left hover:bg-foreground/5 ${t.active ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <span className="w-24 shrink-0 truncate text-muted-foreground/70">{t.appId.replace('tabs-', '')}</span>
              <span className="truncate">{t.title}</span>
              {t.instanceId === self.instanceId && <span className="text-muted-foreground/60">(this tab)</span>}
              <span className="ml-auto text-muted-foreground/50">{t.active ? 'active' : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const consoleApp: HudsonApp = {
  id: 'tabs-console',
  name: 'Console',
  mode: 'panel',
  icon: createElement(Terminal, { size: 12 }),
  tab: { glyph: '›', defaultPlacement: { dock: 'bottom' } },
  Provider: Passthrough,
  slots: { Content: ConsoleContent },
  hooks: { useCommands: noCommands, useStatus: ready },
};

// --- shared ---------------------------------------------------------------------------

function DemoButton({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        primary
          ? 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/15'
          : 'border-input text-muted-foreground hover:border-ring/60 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export const tabsDemoApps = [notesApp, stopwatchApp, previewApp, consoleApp];

export const tabsDemoWorkspace: HudsonWorkspace = {
  id: 'tabs-demo',
  name: 'Tabs',
  description: 'HUD-015 tabs, splits and docks',
  mode: 'panel',
  apps: tabsDemoApps.map((app) => ({ app })),
};

/** First-run layout: two notes, a stopwatch split right, a preview dock and a console dock. */
export const tabsDemoInitialTabs: ReadonlyArray<OpenTabRequest & { placement?: OpenTabPlacement }> = [
  { appId: 'tabs-notes' },
  { appId: 'tabs-notes' },
  { appId: 'tabs-stopwatch', placement: 'right' },
  { appId: 'tabs-preview', params: { url: '/demo/side-nav' } },
  { appId: 'tabs-console' },
];
