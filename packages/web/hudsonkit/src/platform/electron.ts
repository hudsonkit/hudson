import type { CSSProperties, HTMLAttributes } from 'react';
import type { PlatformActivityBridge } from '../types/activity';
import { HUDSON_ELECTRON_GLOBAL, type ElectronBridgeGlobal } from './bridgeProtocol';
import { createHostBridge, type HostBridge } from './hostBridge';
import type { PlatformAdapter, PlatformChannelBridge, PlatformCommandBridge, PlatformGuestHosting } from './types';

// Chromium's app-region property is not part of React's CSSProperties type.
const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/** Spread on controls inside the draggable title bar to keep them interactive. */
export const ELECTRON_NO_DRAG_PROPS: HTMLAttributes<HTMLElement> = { style: noDragStyle };

/** macOS Electron window using titleBarStyle: 'hiddenInset'. */
export const ELECTRON_ADAPTER: PlatformAdapter = {
  titleBarInset: 28,
  dragRegionProps: { style: dragStyle },
  isSSR: false,
  apiBaseUrl: '',
  serviceApiUrl: '',
};

/**
 * What an Electron preload hands the renderer (through contextBridge). The
 * main process only relays: commands come from the app menu, activities from
 * the host process that owns them (HUD-015 §13). Electron itself is never
 * the host.
 */
export interface ElectronAdapterOptions {
  /** Defaults to the preload bridge's commands, when @hudsonkit/electron's preload is loaded. */
  commands?: PlatformCommandBridge;
  /** Defaults to the preload bridge's activities. */
  activities?: PlatformActivityBridge;
  /** Defaults to the preload bridge's channels. */
  channels?: PlatformChannelBridge;
  guestHosting?: PlatformGuestHosting;
  /** Override the hidden-inset title bar height. Default 28. */
  titleBarInset?: number;
  /** Use @hudsonkit/electron's preload bridge when present. Default true. */
  bridge?: boolean;
  /** For tests; defaults to the page's window. */
  window?: Window;
}

const connections = new WeakMap<Window, HostBridge>();

function preloadBridge(win: Window | undefined): ElectronBridgeGlobal | null {
  const global = (win as (Window & Record<string, unknown>) | undefined)?.[HUDSON_ELECTRON_GLOBAL] as
    | Partial<ElectronBridgeGlobal>
    | undefined;
  return global && typeof global.request === 'function' && typeof global.subscribe === 'function'
    ? (global as ElectronBridgeGlobal)
    : null;
}

/** True when @hudsonkit/electron's preload bridge is loaded in this page. */
export function isElectronHost(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return !!preloadBridge(win);
}

/**
 * Connect to the preload bridge from @hudsonkit/electron, or null when it
 * isn't loaded. One connection per window.
 */
export function connectElectronBridge(
  win: Window | undefined = typeof window === 'undefined' ? undefined : window,
): HostBridge | null {
  const global = preloadBridge(win);
  if (!win || !global) return null;
  const existing = connections.get(win);
  if (existing) return existing;
  const bridge = createHostBridge({
    request: (message) => global.request(message),
    attach(receive) {
      global.subscribe(receive);
    },
  });
  connections.set(win, bridge);
  return bridge;
}

/** Bind the host's preload bridges without importing Electron into web code. */
export function createElectronAdapter(options?: ElectronAdapterOptions): PlatformAdapter;
/** @deprecated Pass an options object: `createElectronAdapter({ commands, guestHosting })`. */
export function createElectronAdapter(commands?: PlatformCommandBridge, guestHosting?: PlatformGuestHosting): PlatformAdapter;
export function createElectronAdapter(
  first?: ElectronAdapterOptions | PlatformCommandBridge,
  guestHosting?: PlatformGuestHosting,
): PlatformAdapter {
  const options: ElectronAdapterOptions = isCommandBridge(first) ? { commands: first, guestHosting } : (first ?? {});
  const bridge =
    options.bridge === false ? null : connectElectronBridge(options.window ?? (typeof window === 'undefined' ? undefined : window));
  return {
    ...ELECTRON_ADAPTER,
    titleBarInset: options.titleBarInset ?? ELECTRON_ADAPTER.titleBarInset,
    commands: options.commands ?? bridge?.commands,
    activities: options.activities ?? bridge?.activities,
    channels: options.channels ?? bridge?.channels,
    guestHosting: options.guestHosting,
  };
}

function isCommandBridge(value: unknown): value is PlatformCommandBridge {
  return !!value && typeof (value as PlatformCommandBridge).subscribe === 'function';
}
