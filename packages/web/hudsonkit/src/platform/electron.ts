import type { CSSProperties, HTMLAttributes } from 'react';
import type { PlatformAdapter } from './types';

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
