// ---------------------------------------------------------------------------
// A Hudson window: the BrowserWindow setup HudsonKit's shells expect.
//
// - Hidden-inset title bar, matching ELECTRON_ADAPTER's 28px inset.
// - Context isolation and the sandbox on; the page gets only the bridge.
// - New windows and target=_blank links open in the system browser unless
//   the app handles them.
// ---------------------------------------------------------------------------
import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';
import { fileURLToPath } from 'node:url';
import type { HudsonBridge } from './bridge';

/** The ready-made preload script, for windows that don't need their own. */
export const HUDSON_PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url));

export interface HudsonWindowOptions {
  /** Load this URL (a dev server)… */
  url?: string;
  /** …or this file (a static export). */
  file?: string;
  /** Serve the page over this bridge. */
  bridge?: HudsonBridge;
  /** Your own preload, which must call `exposeHudsonBridge()`. Default HUDSON_PRELOAD. */
  preload?: string;
  /** Window background while the page loads. Match the app's theme to avoid a flash. */
  backgroundColor?: string;
  /** Called for window.open and target=_blank. Return true if handled; otherwise it opens in the system browser. */
  onOpenUrl?: (url: string) => boolean;
  /** Anything else for the BrowserWindow. `webPreferences` merges over the defaults. */
  window?: BrowserWindowConstructorOptions;
}

export function createHudsonWindow(options: HudsonWindowOptions = {}): BrowserWindow {
  const { webPreferences, ...windowOptions } = options.window ?? {};
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: options.backgroundColor ?? '#0a0b0d',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 9 },
    ...windowOptions,
    webPreferences: {
      preload: options.preload ?? HUDSON_PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      ...webPreferences,
    },
  });

  options.bridge?.attach(win.webContents);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!options.onOpenUrl?.(url) && /^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (options.url) void win.loadURL(options.url);
  else if (options.file) void win.loadFile(options.file);
  return win;
}
