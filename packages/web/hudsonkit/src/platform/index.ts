export type { PlatformAdapter, PlatformCommandBridge, PlatformGuestHosting, PlatformChannelBridge, PlatformHostChannel } from './types';
export { WEB_ADAPTER } from './defaults';
export { PlatformProvider, usePlatform } from './PlatformContext';
export { usePlatformLayout } from './usePlatformLayout';
export type { PlatformLayout } from './usePlatformLayout';
export { ELECTRON_ADAPTER, ELECTRON_NO_DRAG_PROPS, createElectronAdapter, connectElectronBridge, isElectronHost } from './electron';
export { createHostBridge } from './hostBridge';
export type { HostBridge, HostBridgeTransport } from './hostBridge';
export type { ElectronAdapterOptions } from './electron';
export { createWebKitAdapter, connectWebKitBridge, isWebKitHost } from './webkit';
export type { WebKitAdapterOptions, WebKitBridge, WebKitBridgeOptions } from './webkit';
export {
  HUDSON_BRIDGE_VERSION,
  HUDSON_BRIDGE_HANDLER,
  HUDSON_BRIDGE_GLOBAL,
  HUDSON_BRIDGE_BUFFER_LIMIT,
  HUDSON_ELECTRON_GLOBAL,
  HUDSON_ELECTRON_REQUEST,
  HUDSON_ELECTRON_EVENT,
  hudsonBridgeBootstrapScript,
} from './bridgeProtocol';
export type { HudsonBridgeRequest, HudsonBridgeEvent, HudsonBridgeHello, ElectronBridgeGlobal } from './bridgeProtocol';
