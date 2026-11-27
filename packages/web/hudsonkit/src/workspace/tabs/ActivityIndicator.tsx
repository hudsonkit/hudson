'use client';

// ---------------------------------------------------------------------------
// The status-bar activity indicator and plain activity controls
// (HUD-015 §13). The indicator lists every activity the host reports,
// including ones with no open tab, so quitting the UI never hides live work.
// ---------------------------------------------------------------------------
import { useMemo, useState, type ReactNode } from 'react';
import { HudPopover } from '../../components/behaviors/HudPopover';
import { AlertTriangle, ExternalLink, Pause, Play, Square } from '../../icons';
import { activityKey, type ActivityRef, type ActivitySnapshot, type PlatformActivityBridge } from '../../types/activity';
import { isLiveActivity, useActivities, useActivitySender } from './activities';

/** How to name a kind in the summary: a word ("recording") or a function of the count. */
export type ActivityKindLabel = string | ((count: number) => string);

export interface ActivityIndicatorProps {
  /** Activity source; defaults to the platform adapter's. */
  activities?: PlatformActivityBridge;
  /** Summary words per kind, e.g. `{ recording: 'recording', playback: 'playing' }`. Default: the kind. */
  labels?: Readonly<Record<string, ActivityKindLabel>>;
  /** Open (or focus) the tab for an activity. Without it, rows have no open button. */
  onOpen?: (ref: ActivityRef) => void;
  /** Which activities have something to open. Default: all, when onOpen is set. */
  canOpen?: (ref: ActivityRef) => boolean;
  className?: string;
}

const STATE_LABEL: Record<ActivitySnapshot['state'], string> = {
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  ended: 'Ended',
  failed: 'Failed',
  unreachable: 'Host not reachable',
};

/** "1 recording · 2 playing". Exported for tests and custom indicators. */
export function summarizeActivities(
  snapshots: Iterable<ActivitySnapshot>,
  labels: Readonly<Record<string, ActivityKindLabel>> = {},
): string {
  const counts = new Map<string, number>();
  for (const s of snapshots) {
    if (!isLiveActivity(s)) continue;
    counts.set(s.ref.kind, (counts.get(s.ref.kind) ?? 0) + 1);
  }
  return [...counts]
    .map(([kind, count]) => {
      const label = labels[kind];
      if (typeof label === 'function') return label(count);
      return `${count} ${label ?? kind}`;
    })
    .join(' · ');
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

export function ActivityIndicator({ activities: bridge, labels, onOpen, canOpen, className = '' }: ActivityIndicatorProps) {
  const activities = useActivities(bridge);
  // Ended activities belong to their tabs (which show the final state), not here.
  const shown = useMemo(() => [...activities.values()].filter((s) => s.state !== 'ended'), [activities]);
  const summary = useMemo(() => summarizeActivities(shown, labels), [labels, shown]);
  const troubled = shown.filter((s) => s.state === 'failed' || s.state === 'unreachable').length;
  // Pulse only while something is actually running; paused work sits still.
  const running = shown.filter((s) => s.state === 'running' || s.state === 'starting').length;

  if (shown.length === 0) return null;

  const text = summary || `${troubled} need${troubled === 1 ? 's' : ''} attention`;
  const label = `Activities: ${text}`;

  return (
    <HudPopover
      side="top"
      align="end"
      className="w-[300px]"
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          className={`flex h-5 items-center gap-1.5 rounded px-1.5 text-[9px] uppercase tracking-[0.14em] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            troubled ? 'text-warning' : 'text-muted-foreground hover:text-foreground'
          } ${className}`}
        >
          {troubled > 0 ? (
            <AlertTriangle size={10} aria-hidden />
          ) : (
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              {running > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40 motion-reduce:animate-none" />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
          <span className="truncate">{text}</span>
        </button>
      }
    >
      <div role="list" aria-label="Activities" className="-mx-1 flex max-h-[50vh] flex-col overflow-y-auto">
        {shown.map((snapshot) => (
          <ActivityRow
            key={activityKey(snapshot.ref)}
            snapshot={snapshot}
            bridge={bridge}
            onOpen={onOpen && (canOpen?.(snapshot.ref) ?? true) ? () => onOpen(snapshot.ref) : undefined}
          />
        ))}
      </div>
    </HudPopover>
  );
}

function ActivityRow({
  snapshot,
  bridge,
  onOpen,
}: {
  snapshot: ActivitySnapshot;
  bridge?: PlatformActivityBridge;
  onOpen?: () => void;
}) {
  const { progress, state } = snapshot;
  const troubled = state === 'failed' || state === 'unreachable';
  return (
    <div role="listitem" className="flex items-center gap-2 rounded-md px-1 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-popover-foreground">{snapshot.title ?? `${snapshot.ref.kind} ${snapshot.ref.id}`}</div>
        <div className={`flex items-center gap-1.5 font-mono text-[9px] ${troubled ? 'text-warning' : 'text-muted-foreground'}`}>
          <span>{STATE_LABEL[state]}</span>
          {progress && (
            <span className="tabular-nums">
              {formatClock(progress.position)}
              {progress.duration != null && ` / ${formatClock(progress.duration)}`}
            </span>
          )}
          {snapshot.lifetime === 'host' && <span title="Keeps running after you quit">· survives quit</span>}
        </div>
        {snapshot.error && <div className="mt-0.5 truncate text-[10px] text-destructive" title={snapshot.error}>{snapshot.error}</div>}
      </div>
      <ActivityControls snapshot={snapshot} bridge={bridge} />
      {onOpen && (
        <IconButton label="Open its tab" onClick={onOpen}>
          <ExternalLink size={11} />
        </IconButton>
      )}
    </div>
  );
}

export interface ActivityControlsProps {
  snapshot: ActivitySnapshot;
  /** Activity source; defaults to the platform adapter's. */
  bridge?: PlatformActivityBridge;
  className?: string;
}

/**
 * Plain buttons for the standard verbs the activity offers right now
 * (pause, resume, stop). Apps draw richer controls (seek, rate, their own
 * commands) with `useActivitySender`.
 */
export function ActivityControls({ snapshot, bridge, className = '' }: ActivityControlsProps) {
  const send = useActivitySender(bridge);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const controls = new Set(snapshot.controls);

  const run = (command: string) => {
    setBusy(command);
    setFailed(null);
    send(snapshot.ref, command)
      .catch((error: unknown) => {
        console.error(`[Hudson] activity ${command} failed:`, error);
        setFailed(command);
      })
      .finally(() => setBusy(null));
  };

  const buttons: ReactNode[] = [];
  if (controls.has('pause') && snapshot.state === 'running') {
    buttons.push(
      <IconButton key="pause" label="Pause" busy={busy === 'pause'} failed={failed === 'pause'} onClick={() => run('pause')}>
        <Pause size={11} />
      </IconButton>,
    );
  }
  if (controls.has('resume') && snapshot.state === 'paused') {
    buttons.push(
      <IconButton key="resume" label="Resume" busy={busy === 'resume'} failed={failed === 'resume'} onClick={() => run('resume')}>
        <Play size={11} />
      </IconButton>,
    );
  }
  if (controls.has('stop') && isLiveActivity(snapshot)) {
    buttons.push(
      <IconButton key="stop" label="Stop" busy={busy === 'stop'} failed={failed === 'stop'} onClick={() => run('stop')}>
        <Square size={10} />
      </IconButton>,
    );
  }
  if (buttons.length === 0) return null;
  return <div className={`flex items-center gap-0.5 ${className}`}>{buttons}</div>;
}

function IconButton({
  label,
  busy,
  failed,
  onClick,
  children,
}: {
  label: string;
  busy?: boolean;
  failed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = failed ? `${label} failed — try again` : label;
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        failed ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
