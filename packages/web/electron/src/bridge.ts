// ---------------------------------------------------------------------------
// The host end of the Hudson bridge in Electron's main process (HUD-015 §13).
//
// Electron is a UI, never a host. This module only relays: menu commands go
// to the page, and activity and channel requests go to whatever the app
// passes in, which in turn talks to the real host process (a Swift agent, a
// Bun daemon, a broker). Nothing here owns long-running work.
//
// Wire protocol: hudsonkit/bridge-protocol. The preload half is preload.ts.
// ---------------------------------------------------------------------------
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  HUDSON_BRIDGE_VERSION,
  HUDSON_ELECTRON_EVENT,
  HUDSON_ELECTRON_REQUEST,
  isActivitySnapshot,
  type HudsonBridgeEvent,
  type HudsonBridgeHello,
} from 'hudsonkit/bridge-protocol';
import type { ActivityRef, ActivitySnapshot } from 'hudsonkit';

/** Relays the page's activity requests to the process that owns them. */
export interface HudsonActivityProvider {
  list(): ActivitySnapshot[] | Promise<ActivitySnapshot[]>;
  send(ref: ActivityRef, command: string, args?: unknown): void | Promise<void>;
}

/**
 * Answers one named app channel. Returning a value answers `request`; for
 * `post` the value is ignored. Throw to refuse.
 */
export type HudsonChannelHandler = (body: unknown, sender: WebContents) => unknown | Promise<unknown>;

export interface HudsonBridgeOptions {
  activities?: HudsonActivityProvider;
  /** App channels by name, e.g. `{ scoutSettings: (body) => … }`. */
  channels?: Record<string, HudsonChannelHandler>;
  /**
   * Which pages may use the bridge. Default: every page in a window this
   * bridge attached to. Pages a window navigates to elsewhere still pass, so
   * apps that load remote content in the main frame should check the URL.
   */
  allow?: (sender: WebContents) => boolean;
}

export interface HudsonBridge {
  /** Serve this page. Done for you by `createHudsonWindow`. */
  attach(contents: WebContents): void;
  detach(contents: WebContents): void;
  /** Run a shell command in the page (`tabs.close`, an app command…). */
  send(command: string, args?: unknown, target?: WebContents): void;
  /** Push an activity's new state to every page. */
  publish(snapshot: ActivitySnapshot): void;
  /** Push a message on an app channel. */
  emit(channel: string, body?: unknown, target?: WebContents): void;
  /** Serve, or stop serving, a channel after creation. */
  setChannel(name: string, handler: HudsonChannelHandler | null): void;
  setActivities(provider: HudsonActivityProvider | null): void;
  /** Remove the IPC handler. */
  dispose(): void;
}

export class HudsonBridgeError extends Error {
  constructor(
    readonly code: 'malformed_request' | 'unsupported_op' | 'unknown_channel' | 'no_activities' | 'not_allowed',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HudsonBridgeError';
  }
}

let installed = false;

/**
 * Create the bridge. There is one per app: it owns the `ipcMain` handler for
 * the bridge channel, so creating a second one before disposing the first
 * throws.
 */
export function createHudsonBridge(options: HudsonBridgeOptions = {}): HudsonBridge {
  if (installed) throw new Error('A Hudson bridge already exists; dispose it before creating another.');
  installed = true;

  let activities = options.activities ?? null;
  const channels = new Map(Object.entries(options.channels ?? {}));
  const pages = new Set<WebContents>();
  const allow = options.allow ?? ((sender: WebContents) => pages.has(sender));

  const hello = (): HudsonBridgeHello => ({
    version: HUDSON_BRIDGE_VERSION,
    capabilities: ['commands', ...(activities ? ['activities'] : []), ...(channels.size ? ['channels'] : [])],
    channels: [...channels.keys()],
  });

  const handle = async (event: IpcMainInvokeEvent, message: unknown): Promise<unknown> => {
    if (!allow(event.sender)) throw new HudsonBridgeError('not_allowed');
    if (!message || typeof message !== 'object') throw new HudsonBridgeError('malformed_request');
    const m = message as Record<string, unknown>;
    switch (m.op) {
      case 'hello':
        return hello();
      case 'activities.list': {
        if (!activities) return [];
        const list = await activities.list();
        return Array.isArray(list) ? list.filter(isActivitySnapshot) : [];
      }
      case 'activities.send': {
        const ref = m.ref as Partial<ActivityRef> | undefined;
        if (!ref || typeof ref.kind !== 'string' || typeof ref.id !== 'string' || typeof m.command !== 'string') {
          throw new HudsonBridgeError('malformed_request');
        }
        if (!activities) throw new HudsonBridgeError('no_activities');
        await activities.send({ kind: ref.kind, id: ref.id }, m.command, m.args);
        return null;
      }
      case 'channel.request':
      case 'channel.post': {
        if (typeof m.channel !== 'string') throw new HudsonBridgeError('malformed_request');
        const handler = channels.get(m.channel);
        if (!handler) throw new HudsonBridgeError('unknown_channel', `No host channel "${m.channel}"`);
        const result = await handler(m.body, event.sender);
        return m.op === 'channel.request' ? (result ?? null) : null;
      }
      default:
        throw new HudsonBridgeError('unsupported_op');
    }
  };
  ipcMain.handle(HUDSON_ELECTRON_REQUEST, handle);

  const deliver = (event: HudsonBridgeEvent, target?: WebContents) => {
    const targets = target ? [target] : [...pages];
    for (const contents of targets) {
      if (!contents.isDestroyed()) contents.send(HUDSON_ELECTRON_EVENT, event);
    }
  };

  return {
    attach(contents) {
      if (pages.has(contents)) return;
      pages.add(contents);
      contents.once('destroyed', () => pages.delete(contents));
    },
    detach(contents) {
      pages.delete(contents);
    },
    send(command, args, target) {
      deliver({ type: 'command', command, ...(args === undefined ? {} : { args }) }, target);
    },
    publish(snapshot) {
      if (!isActivitySnapshot(snapshot)) throw new HudsonBridgeError('malformed_request', 'Not an activity snapshot');
      deliver({ type: 'activity', snapshot });
    },
    emit(channel, body, target) {
      deliver({ type: 'channel', channel, ...(body === undefined ? {} : { body }) }, target);
    },
    setChannel(name, handler) {
      if (handler) channels.set(name, handler);
      else channels.delete(name);
    },
    setActivities(provider) {
      activities = provider;
    },
    dispose() {
      ipcMain.removeHandler(HUDSON_ELECTRON_REQUEST);
      pages.clear();
      installed = false;
    },
  };
}
