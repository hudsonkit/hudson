export type { PlatformAdapter, PlatformCommandBridge, PlatformGuestHosting } from './types';
export { WEB_ADAPTER } from './defaults';
export { PlatformProvider, usePlatform } from './PlatformContext';
export { usePlatformLayout } from './usePlatformLayout';
export type { PlatformLayout } from './usePlatformLayout';
export { ELECTRON_ADAPTER, ELECTRON_NO_DRAG_PROPS, createElectronAdapter } from './electron';
export type { ElectronAdapterOptions } from './electron';
export { createWebKitAdapter, connectWebKitBridge, isWebKitHost } from './webkit';
export type { WebKitAdapterOptions, WebKitBridge, WebKitBridgeOptions } from './webkit';
export {
  HUDSON_BRIDGE_VERSION,
  HUDSON_BRIDGE_HANDLER,
  HUDSON_BRIDGE_GLOBAL,
  HUDSON_BRIDGE_BUFFER_LIMIT,
  hudsonBridgeBootstrapScript,
} from './bridgeProtocol';
export type { HudsonBridgeRequest, HudsonBridgeEvent, HudsonBridgeHello } from './bridgeProtocol';
