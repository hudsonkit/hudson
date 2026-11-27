/** Host-provided command IDs are opaque to HudsonKit. */
export interface PlatformCommandBridge {
  subscribe: (listener: (command: string) => void) => () => void;
}

/** Capabilities for hosting remote guest content in a native shell. */
export interface PlatformGuestHosting {
  kind: 'electron-webview';
  persistentPartitions: boolean;
}

/**
 * PlatformAdapter — abstracts host-specific concerns so SDK shell chrome
 * runs identically on web (Next.js) and native hosts (Tauri, HudsonKit).
 */
export interface PlatformAdapter {
  /** Subscribe to host commands (e.g. native menu actions), if provided. */
  commands?: PlatformCommandBridge;
  /** Host guest capability hint; this does not grant a guest any permissions. */
  guestHosting?: PlatformGuestHosting;
  /** Extra vertical inset above the nav bar for native title bars (0 for web). */
  titleBarInset: number;
  /** HTML attributes spread onto the nav bar to enable native window dragging. */
  dragRegionProps: React.HTMLAttributes<HTMLElement>;
  /** Called on mousedown of interactive elements inside a drag region to prevent drag. */
  onInteractiveMouseDown?: (e: React.MouseEvent) => void;
  /** Whether the host uses SSR (true for Next.js, false for native). */
  isSSR: boolean;
  /** Base URL for API calls. Empty string = same-origin (web). Native hosts set e.g. 'http://localhost:3600'. */
  apiBaseUrl: string;
  /** Base URL for service management API. Empty string = same-origin (web). Native hosts set e.g. 'http://localhost:3601'. */
  serviceApiUrl: string;
}
