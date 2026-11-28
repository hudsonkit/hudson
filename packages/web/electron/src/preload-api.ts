// ---------------------------------------------------------------------------
// The preload half of the Hudson bridge (HUD-015 §13).
//
// Exposes `window.__hudsonHost` through contextBridge. hudsonkit's
// `createElectronAdapter()` finds it and gives the shell its commands,
// activities and app channels. Events that arrive before the page subscribes
// (a menu command while React mounts) are kept and replayed, like the
// document-start buffer under WKWebView.
//
// Apps with their own preload call `exposeHudsonBridge()` from it. Apps
// without one point the window at `HUDSON_PRELOAD` (see window.ts).
// ---------------------------------------------------------------------------
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  HUDSON_BRIDGE_BUFFER_LIMIT,
  HUDSON_BRIDGE_VERSION,
  HUDSON_ELECTRON_EVENT,
  HUDSON_ELECTRON_GLOBAL,
  HUDSON_ELECTRON_REQUEST,
  type ElectronBridgeGlobal,
  type HudsonBridgeRequest,
} from 'hudsonkit/bridge-protocol';

let exposed = false;

/** Build the object the page sees. Exported for tests; apps call `exposeHudsonBridge`. */
export function createPreloadBridge(ipc: Pick<typeof ipcRenderer, 'invoke' | 'on'> = ipcRenderer): ElectronBridgeGlobal {
  const queue: Array<{ event: unknown; at: number }> = [];
  const listeners = new Set<(event: unknown, at: number) => void>();

  ipc.on(HUDSON_ELECTRON_EVENT, (_event: IpcRendererEvent, payload: unknown) => {
    const at = Date.now();
    if (listeners.size === 0) {
      queue.push({ event: payload, at });
      if (queue.length > HUDSON_BRIDGE_BUFFER_LIMIT) queue.shift();
      return;
    }
    for (const listener of listeners) listener(payload, at);
  });

  return {
    version: HUDSON_BRIDGE_VERSION,
    request: (message: HudsonBridgeRequest) => ipc.invoke(HUDSON_ELECTRON_REQUEST, message),
    subscribe(listener) {
      listeners.add(listener);
      // Replay to the first subscriber only; later ones join live.
      for (const item of queue.splice(0)) listener(item.event, item.at);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Expose the bridge to the page. Safe to call more than once. */
export function exposeHudsonBridge(): void {
  if (exposed) return;
  exposed = true;
  contextBridge.exposeInMainWorld(HUDSON_ELECTRON_GLOBAL, createPreloadBridge());
}
