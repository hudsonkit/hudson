// @hudsonkit/electron/main — for Electron's main process.
//
// Electron is a UI, never a host (HUD-015 §13): these helpers set up windows,
// the menu and the bridge relay. Long-running work belongs in a separate host
// process that the app talks to from the bridge's providers.
export { createHudsonBridge, HudsonBridgeError } from './bridge';
export type { HudsonActivityProvider, HudsonBridge, HudsonBridgeOptions, HudsonChannelHandler } from './bridge';
export { createHudsonWindow, HUDSON_PRELOAD } from './window';
export type { HudsonWindowOptions } from './window';
export { hudsonMenuTemplate, installHudsonMenu, TAB_MENU_COMMANDS } from './menu';
export type { HudsonMenuCommand, HudsonMenuOptions } from './menu';
export { quitWhenWindowsClose } from './lifecycle';
