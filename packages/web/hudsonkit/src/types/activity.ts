// ---------------------------------------------------------------------------
// Activities (HUD-015 §13) — work owned by a host that outlives the UI.
//
// A recording, a transcription or an agent flight is an activity. Its host
// (a menu-bar agent, a daemon, a broker; Rust, Swift or Bun, never Electron)
// keeps it running when the UI quits. A tab holds only an ActivityRef and
// reads status from the host through the bridge.
// ---------------------------------------------------------------------------

/** Serializable pointer to an activity. Lives in tab params. */
export interface ActivityRef {
  kind: string;
  id: string;
}

export type ActivityState = 'starting' | 'running' | 'paused' | 'ended' | 'failed' | 'unreachable';

/**
 * - `'ui'`: the host stops it when the last UI detaches (playback by default).
 * - `'host'`: it survives quitting the UI (recording, always). Only valid when
 *   the host can stop it without the UI, e.g. from a menu-bar item.
 */
export type ActivityLifetime = 'ui' | 'host';

/** Standard transport verbs. Apps may add their own command names. */
export type ActivityControl = 'pause' | 'resume' | 'stop' | 'seek' | 'rate';

export interface ActivitySnapshot {
  ref: ActivityRef;
  state: ActivityState;
  lifetime: ActivityLifetime;
  title?: string;
  progress?: { position: number; duration?: number };
  /** Commands that apply right now. */
  controls: Array<ActivityControl | (string & {})>;
  error?: string;
}

/**
 * Bridge between the UI and the host that owns activities. Supplied by the
 * platform adapter (Electron preload, WKWebView message handler) or by the
 * app itself over its own server (e.g. Scout's broker).
 */
export interface PlatformActivityBridge {
  list(): Promise<ActivitySnapshot[]>;
  subscribe(listener: (snapshot: ActivitySnapshot) => void): () => void;
  send(ref: ActivityRef, command: string, args?: unknown): Promise<void>;
}

/** Stable string key for an ActivityRef, for maps and comparisons. */
export function activityKey(ref: ActivityRef): string {
  return `${ref.kind}:${ref.id}`;
}
