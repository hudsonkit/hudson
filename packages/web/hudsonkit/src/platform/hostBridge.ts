// ---------------------------------------------------------------------------
// The page end of the Hudson host bridge, for any transport (HUD-015 §9, §13).
//
// A transport moves protocol messages (bridgeProtocol.ts) between the page and
// its native host: WKWebView script messages, or an Electron preload over IPC.
// Everything above the transport, such as buffering events until the shell
// subscribes, dropping stale commands and validating what the host sends, is
// the same for every host and lives here.
// ---------------------------------------------------------------------------
import type { ActivityRef, ActivitySnapshot, PlatformActivityBridge } from '../types/activity';
import {
  HUDSON_BRIDGE_BUFFER_LIMIT,
  HUDSON_BRIDGE_VERSION,
  isActivitySnapshot,
  isBridgeEvent,
  type HudsonBridgeEvent,
  type HudsonBridgeHello,
  type HudsonBridgeRequest,
} from './bridgeProtocol';
import type { PlatformChannelBridge, PlatformCommandBridge, PlatformHostChannel } from './types';

/** Moves bridge messages between the page and its host. */
export interface HostBridgeTransport {
  /** Send one request; resolves with the host's reply. */
  request(message: HudsonBridgeRequest): Promise<unknown>;
  /**
   * Start receiving host events. Called once. A transport that buffered
   * events before this (a document-start script) replays them first, in
   * order, each with when it arrived (ms).
   */
  attach(receive: (event: unknown, at: number) => void): void;
}

export interface HostBridge {
  commands: PlatformCommandBridge;
  activities: PlatformActivityBridge;
  channels: PlatformChannelBridge;
  /** Ask the host which protocol version and bridges it serves. */
  hello(): Promise<HudsonBridgeHello>;
}

/** Buffered commands older than this are dropped, not delivered. */
export const STALE_COMMAND_MS = 3000;

export function createHostBridge(transport: HostBridgeTransport): HostBridge {
  const commandListeners = new Set<(command: string, args?: unknown) => void>();
  const activityListeners = new Set<(snapshot: ActivitySnapshot) => void>();
  const channelListeners = new Map<string, Set<(body: unknown) => void>>();
  // Events with no listener yet wait here, so a command sent while React is
  // still mounting is delivered once the shell subscribes. Commands go stale:
  // a shortcut pressed seconds before the shell existed should not fire later.
  const pending: Array<{ event: HudsonBridgeEvent; at: number }> = [];

  const deliver = (event: HudsonBridgeEvent): boolean => {
    if (event.type === 'command') {
      if (commandListeners.size === 0) return false;
      for (const listener of commandListeners) listener(event.command, event.args);
      return true;
    }
    if (event.type === 'channel') {
      const listeners = channelListeners.get(event.channel);
      if (!listeners || listeners.size === 0) return false;
      for (const listener of listeners) listener(event.body);
      return true;
    }
    if (activityListeners.size === 0) return false;
    for (const listener of activityListeners) listener(event.snapshot);
    return true;
  };

  const accept = (event: unknown, at: number) => {
    if (!isBridgeEvent(event)) {
      console.warn('[Hudson] ignored a malformed host bridge event:', event);
      return;
    }
    if (!deliver(event)) {
      pending.push({ event, at });
      if (pending.length > HUDSON_BRIDGE_BUFFER_LIMIT) pending.shift();
    }
  };

  const flushPending = () => {
    const now = Date.now();
    for (let i = 0; i < pending.length; ) {
      const { event, at } = pending[i]!;
      if (event.type === 'command' && now - at > STALE_COMMAND_MS) pending.splice(i, 1);
      else if (deliver(event)) pending.splice(i, 1);
      else i += 1;
    }
  };

  transport.attach(accept);

  // Not cached: a host may start serving a bridge after the page loads.
  const askHello = async (): Promise<HudsonBridgeHello> =>
    parseHello(await transport.request({ op: 'hello', version: HUDSON_BRIDGE_VERSION }));

  const channel = (name: string): PlatformHostChannel => ({
    name,
    request: (body?: unknown) => transport.request({ op: 'channel.request', channel: name, body }),
    post(body?: unknown) {
      transport.request({ op: 'channel.post', channel: name, body }).catch((error: unknown) => {
        console.warn(`[Hudson] host channel "${name}" refused a message:`, error);
      });
    },
    subscribe(listener) {
      let listeners = channelListeners.get(name);
      if (!listeners) {
        listeners = new Set();
        channelListeners.set(name, listeners);
      }
      listeners.add(listener);
      flushPending();
      return () => {
        listeners.delete(listener);
      };
    },
  });

  return {
    commands: {
      subscribe(listener) {
        commandListeners.add(listener);
        flushPending();
        return () => {
          commandListeners.delete(listener);
        };
      },
    },
    activities: {
      async list() {
        const reply = await transport.request({ op: 'activities.list' });
        if (!Array.isArray(reply)) return [];
        return reply.filter(isActivitySnapshot);
      },
      subscribe(listener) {
        activityListeners.add(listener);
        flushPending();
        return () => {
          activityListeners.delete(listener);
        };
      },
      async send(ref: ActivityRef, command: string, args?: unknown) {
        await transport.request({ op: 'activities.send', ref, command, args });
      },
    },
    channels: {
      channel,
      async has(name: string) {
        try {
          return (await askHello()).channels.includes(name);
        } catch {
          return false;
        }
      },
    },
    hello: askHello,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function parseHello(reply: unknown): HudsonBridgeHello {
  const r = (reply ?? {}) as Partial<Record<keyof HudsonBridgeHello, unknown>>;
  return {
    version: typeof r.version === 'number' ? r.version : 0,
    capabilities: strings(r.capabilities),
    channels: strings(r.channels),
  };
}
