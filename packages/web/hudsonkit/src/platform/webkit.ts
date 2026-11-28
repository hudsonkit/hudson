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
import { HUDSON_BRIDGE_GLOBAL, HUDSON_BRIDGE_HANDLER, type HudsonBridgeGlobal } from './bridgeProtocol';
import { createHostBridge, type HostBridge } from './hostBridge';
import type { PlatformAdapter } from './types';

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
  /** Expose the app's named host channels. Default true. */
  channels?: boolean;
  /** Native title bar inset above the nav bar. Default 0. */
  titleBarInset?: number;
  apiBaseUrl?: string;
  serviceApiUrl?: string;
}

export type WebKitBridge = HostBridge;

function currentWindow(options: WebKitBridgeOptions): WebKitWindow | null {
  const win = options.window ?? (typeof window === 'undefined' ? undefined : window);
  return (win as WebKitWindow | undefined) ?? null;
}

/** True when the page runs inside a WKWebView host that serves the Hudson bridge. */
export function isWebKitHost(options: WebKitBridgeOptions = {}): boolean {
  const win = currentWindow(options);
  return !!win?.webkit?.messageHandlers?.[options.handler ?? HUDSON_BRIDGE_HANDLER];
}

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

  const bridge = createHostBridge({
    async request(message) {
      const handler = win.webkit?.messageHandlers?.[handlerName];
      if (!handler) throw new Error('Hudson host bridge is gone');
      return handler.postMessage(message);
    },
    attach(receive) {
      const previous = win[globalName] as HudsonBridgeGlobal | undefined;
      const live: HudsonBridgeGlobal = { receive: (event) => receive(event, Date.now()) };
      win[globalName] = live;
      for (const item of previous?.queue ?? []) receive(item?.event, typeof item?.at === 'number' ? item.at : Date.now());
    },
  });
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
    channels: bridge && options.channels !== false ? bridge.channels : undefined,
  };
}
