import type { CSSProperties, HTMLAttributes } from 'react';
import type { PlatformActivityBridge } from '../types/activity';
import type { PlatformAdapter, PlatformCommandBridge, PlatformGuestHosting } from './types';

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
  commands?: PlatformCommandBridge;
  activities?: PlatformActivityBridge;
  guestHosting?: PlatformGuestHosting;
  /** Override the hidden-inset title bar height. Default 28. */
  titleBarInset?: number;
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
  return {
    ...ELECTRON_ADAPTER,
    titleBarInset: options.titleBarInset ?? ELECTRON_ADAPTER.titleBarInset,
    commands: options.commands,
    activities: options.activities,
    guestHosting: options.guestHosting,
  };
}

function isCommandBridge(value: unknown): value is PlatformCommandBridge {
  return !!value && typeof (value as PlatformCommandBridge).subscribe === 'function';
}
