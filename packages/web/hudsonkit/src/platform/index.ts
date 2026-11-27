export type { PlatformAdapter, PlatformCommandBridge, PlatformGuestHosting } from './types';
export { WEB_ADAPTER } from './defaults';
export { PlatformProvider, usePlatform } from './PlatformContext';
export { usePlatformLayout } from './usePlatformLayout';
export type { PlatformLayout } from './usePlatformLayout';
export { ELECTRON_ADAPTER, ELECTRON_NO_DRAG_PROPS, createElectronAdapter } from './electron';
