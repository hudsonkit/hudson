// ---------------------------------------------------------------------------
// WKWebView platform adapter (HUD-015 §9, §13).
//
// For pages hosted in a native WKWebView (Scout.app, Talkie). The host
// installs a script message handler and the bootstrap user script from
// bridgeProtocol.ts; HudsonUIWeb's `HudWebBridge` does both. Commands from a
// Swift CommandGroup reach the shell through `adapter.commands`; activities
// owned by the host (a menu-bar agent) through `adapter.activities`.
//
// The web content process can be reloaded or killed at any time, which is
// why activity state lives in the host and the page only ever reads it.
// ---------------------------------------------------------------------------
import type { ActivityRef, ActivitySnapshot, PlatformActivityBridge } from '../types/activity';
import {
  HUDSON_BRIDGE_BUFFER_LIMIT,
  HUDSON_BRIDGE_GLOBAL,
  HUDSON_BRIDGE_HANDLER,
  HUDSON_BRIDGE_VERSION,
  isActivitySnapshot,
  isBridgeEvent,
  type HudsonBridgeEvent,
  type HudsonBridgeGlobal,
  type HudsonBridgeHello,
  type HudsonBridgeRequest,
} from './bridgeProtocol';
import type { PlatformAdapter, PlatformCommandBridge } from './types';

interface WebKitMessageHandler {
  postMessage(message: unknown): Promise<unknown> | void;
}

type WebKitWindow = Window & {
  webkit?: { messageHandlers?: Record<string, WebKitMessageHandler | undefined> };
} & Record<string, unknown>;

export interface WebKitBridgeOptions {
  /** WKScriptMessageHandler name. Default 'hudsonBridge'. */
  handler?: string;
  /** Window global the host evaluates into. Default '__hudsonBridge'. */
  global?: string;
  /** For tests; defaults to the page's window. */
  window?: Window;
}

export interface WebKitAdapterOptions extends WebKitBridgeOptions {
  /** Expose the host command bridge. Default true. */
  commands?: boolean;
  /** Expose the host activity bridge. Default true. */
  activities?: boolean;
  /** Native title bar inset above the nav bar. Default 0. */
  titleBarInset?: number;
  apiBaseUrl?: string;
  serviceApiUrl?: string;
}

export interface WebKitBridge {
  commands: PlatformCommandBridge;
  activities: PlatformActivityBridge;
  /** Ask the host which protocol version and bridges it serves. */
  hello(): Promise<HudsonBridgeHello>;
}

function currentWindow(options: WebKitBridgeOptions): WebKitWindow | null {
  const win = options.window ?? (typeof window === 'undefined' ? undefined : window);
  return (win as WebKitWindow | undefined) ?? null;
}

/** True when the page runs inside a WKWebView host that serves the Hudson bridge. */
export function isWebKitHost(options: WebKitBridgeOptions = {}): boolean {
  const win = currentWindow(options);
  return !!win?.webkit?.messageHandlers?.[options.handler ?? HUDSON_BRIDGE_HANDLER];
}

/** Buffered commands older than this are dropped, not delivered. */
const STALE_COMMAND_MS = 3000;

// One connection per window and global: the host evaluates into a single
// receive(), so every adapter on the page must share it.
const connections = new WeakMap<Window, Map<string, WebKitBridge>>();

/**
 * Connect to the host bridge, or return null when the page isn't hosted.
 * Takes over the bootstrap buffer and replays what it held, in order.
 */
export function connectWebKitBridge(options: WebKitBridgeOptions = {}): WebKitBridge | null {
  const win = currentWindow(options);
  const handlerName = options.handler ?? HUDSON_BRIDGE_HANDLER;
  const globalName = options.global ?? HUDSON_BRIDGE_GLOBAL;
  if (!win || !win.webkit?.messageHandlers?.[handlerName]) return null;

  let byGlobal = connections.get(win);
  if (!byGlobal) {
    byGlobal = new Map();
    connections.set(win, byGlobal);
  }
  const existing = byGlobal.get(globalName);
  if (existing) return existing;

  const commandListeners = new Set<(command: string, args?: unknown) => void>();
  const activityListeners = new Set<(snapshot: ActivitySnapshot) => void>();
  // Events with no listener yet wait here, so a command sent while React is
  // still mounting is delivered once the shell subscribes. Commands go stale:
  // a shortcut pressed seconds before the shell existed should not fire later.
  const pending: Array<{ event: HudsonBridgeEvent; at: number }> = [];

  const deliver = (event: HudsonBridgeEvent): boolean => {
    if (event.type === 'command') {
      if (commandListeners.size === 0) return false;
      for (const listener of commandListeners) listener(event.command, event.args);
      return true;
    }
    if (activityListeners.size === 0) return false;
    for (const listener of activityListeners) listener(event.snapshot);
    return true;
  };

  const accept = (event: unknown, at: number) => {
    if (!isBridgeEvent(event)) {
      console.warn('[Hudson] ignored a malformed host bridge event:', event);
      return;
    }
    if (!deliver(event)) {
      pending.push({ event, at });
      if (pending.length > HUDSON_BRIDGE_BUFFER_LIMIT) pending.shift();
    }
  };

  const flushPending = () => {
    const now = Date.now();
    for (let i = 0; i < pending.length; ) {
      const { event, at } = pending[i]!;
      if (event.type === 'command' && now - at > STALE_COMMAND_MS) pending.splice(i, 1);
      else if (deliver(event)) pending.splice(i, 1);
      else i += 1;
    }
  };

  const previous = win[globalName] as HudsonBridgeGlobal | undefined;
  const live: HudsonBridgeGlobal = { receive: (event) => accept(event, Date.now()) };
  win[globalName] = live;
  for (const item of previous?.queue ?? []) accept(item?.event, typeof item?.at === 'number' ? item.at : Date.now());

  const request = async (message: HudsonBridgeRequest): Promise<unknown> => {
    const handler = win.webkit?.messageHandlers?.[handlerName];
    if (!handler) throw new Error('Hudson host bridge is gone');
    return handler.postMessage(message);
  };

  const bridge: WebKitBridge = {
    commands: {
      subscribe(listener) {
        commandListeners.add(listener);
        flushPending();
        return () => {
          commandListeners.delete(listener);
        };
      },
    },
    activities: {
      async list() {
        const reply = await request({ op: 'activities.list' });
        if (!Array.isArray(reply)) return [];
        return reply.filter(isActivitySnapshot);
      },
      subscribe(listener) {
        activityListeners.add(listener);
        flushPending();
        return () => {
          activityListeners.delete(listener);
        };
      },
      async send(ref: ActivityRef, command: string, args?: unknown) {
        await request({ op: 'activities.send', ref, command, args });
      },
    },
    async hello() {
      const reply = (await request({ op: 'hello', version: HUDSON_BRIDGE_VERSION })) as Partial<HudsonBridgeHello> | null;
      return {
        version: typeof reply?.version === 'number' ? reply.version : 0,
        capabilities: Array.isArray(reply?.capabilities) ? reply.capabilities.filter((c) => typeof c === 'string') : [],
      };
    },
  };
  byGlobal.set(globalName, bridge);
  return bridge;
}

/**
 * Adapter for a WKWebView host. Outside a host (a plain browser, SSR) it
 * returns an adapter with no bridges, so the same build runs on the web.
 */
export function createWebKitAdapter(options: WebKitAdapterOptions = {}): PlatformAdapter {
  const bridge = connectWebKitBridge(options);
  return {
    titleBarInset: options.titleBarInset ?? 0,
    // The native window owns dragging; CSS app-region does nothing in WebKit.
    dragRegionProps: {},
    isSSR: false,
    apiBaseUrl: options.apiBaseUrl ?? '',
    serviceApiUrl: options.serviceApiUrl ?? '',
    commands: bridge && options.commands !== false ? bridge.commands : undefined,
    activities: bridge && options.activities !== false ? bridge.activities : undefined,
  };
}
