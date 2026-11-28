// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake electron: ipcMain/ipcRenderer wired to each other, so the main and
// preload halves can be tested end to end without launching Electron.
const fake = vi.hoisted(() => {
  type Listener = (event: unknown, payload: unknown) => void;
  const handlers = new Map<string, (event: { sender: unknown }, message: unknown) => unknown>();
  const rendererListeners = new Map<string, Set<Listener>>();
  const exposed: Record<string, unknown> = {};
  const menus: unknown[] = [];

  class FakeContents {
    destroyed = false;
    sent: Array<{ channel: string; payload: unknown }> = [];
    private destroyListeners: Array<() => void> = [];
    isDestroyed() {
      return this.destroyed;
    }
    send(channel: string, payload: unknown) {
      this.sent.push({ channel, payload });
      for (const l of rendererListeners.get(channel) ?? []) l({}, payload);
    }
    once(event: string, listener: () => void) {
      if (event === 'destroyed') this.destroyListeners.push(listener);
    }
    destroy() {
      this.destroyed = true;
      for (const l of this.destroyListeners) l();
    }
    setWindowOpenHandler = vi.fn();
  }

  const contents = new FakeContents();
  const invoke = (channel: string, message: unknown, sender: unknown = contents) => {
    const handler = handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`no handler for ${channel}`));
    return Promise.resolve().then(() => handler({ sender }, message));
  };

  return { handlers, rendererListeners, exposed, menus, FakeContents, contents, invoke };
});

vi.mock('electron', () => {
  class BrowserWindow {
    static last: BrowserWindow | null = null;
    webContents = new fake.FakeContents();
    loadURL = vi.fn(async () => {});
    loadFile = vi.fn(async () => {});
    once = vi.fn();
    constructor(public options: Record<string, unknown>) {
      BrowserWindow.last = this;
    }
  }
  return {
    ipcMain: {
      handle: (channel: string, fn: (event: { sender: unknown }, message: unknown) => unknown) => {
        if (fake.handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
        fake.handlers.set(channel, fn);
      },
      removeHandler: (channel: string) => fake.handlers.delete(channel),
    },
    ipcRenderer: {
      invoke: (channel: string, message: unknown) => fake.invoke(channel, message),
      on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
        let set = fake.rendererListeners.get(channel);
        if (!set) fake.rendererListeners.set(channel, (set = new Set()));
        set.add(listener);
      },
    },
    contextBridge: {
      exposeInMainWorld: (key: string, value: unknown) => {
        fake.exposed[key] = value;
      },
    },
    BrowserWindow,
    shell: { openExternal: vi.fn(async () => {}) },
    app: { name: 'Test', quit: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
    Menu: {
      buildFromTemplate: (template: unknown) => ({ template }),
      setApplicationMenu: (menu: unknown) => fake.menus.push(menu),
    },
  };
});

import * as electron from 'electron';
import {
  HUDSON_ELECTRON_EVENT,
  HUDSON_ELECTRON_GLOBAL,
  HUDSON_ELECTRON_REQUEST,
  type ElectronBridgeGlobal,
} from 'hudsonkit/bridge-protocol';
import type { ActivitySnapshot } from 'hudsonkit';
import { connectElectronBridge, createElectronAdapter } from '../../../hudsonkit/src/platform/electron';
import { createHudsonBridge, type HudsonBridge } from '../bridge';
import { createPreloadBridge } from '../preload-api';
import { createHudsonWindow, HUDSON_PRELOAD } from '../window';
import { hudsonMenuTemplate, TAB_MENU_COMMANDS } from '../menu';

const recording: ActivitySnapshot = {
  ref: { kind: 'recording', id: 'r1' },
  state: 'running',
  lifetime: 'host',
  title: 'Standup',
  controls: ['pause', 'stop'],
};

const request = (message: unknown, sender?: unknown) => fake.invoke(HUDSON_ELECTRON_REQUEST, message, sender);

let bridge: HudsonBridge | null = null;
beforeEach(() => {
  bridge?.dispose();
  bridge = null;
  fake.rendererListeners.clear();
  fake.contents.sent = [];
  fake.contents.destroyed = false;
});

describe('createHudsonBridge (main)', () => {
  it('answers hello with what it serves', async () => {
    bridge = createHudsonBridge();
    bridge.attach(fake.contents as never);
    expect(await request({ op: 'hello', version: 1 })).toEqual({ version: 1, capabilities: ['commands'], channels: [] });

    bridge.setActivities({ list: () => [], send: () => {} });
    bridge.setChannel('scoutSettings', () => 'ok');
    expect(await request({ op: 'hello', version: 1 })).toEqual({
      version: 1,
      capabilities: ['commands', 'activities', 'channels'],
      channels: ['scoutSettings'],
    });
  });

  it('refuses pages it was not attached to', async () => {
    bridge = createHudsonBridge();
    await expect(request({ op: 'hello', version: 1 }, new fake.FakeContents())).rejects.toThrow('not_allowed');
  });

  it('relays activities and validates what crosses', async () => {
    const send = vi.fn();
    bridge = createHudsonBridge({ activities: { list: async () => [recording, { bogus: true } as never], send } });
    bridge.attach(fake.contents as never);
    expect(await request({ op: 'activities.list' })).toEqual([recording]);
    await request({ op: 'activities.send', ref: { kind: 'recording', id: 'r1', extra: 1 }, command: 'stop' });
    expect(send).toHaveBeenCalledWith({ kind: 'recording', id: 'r1' }, 'stop', undefined);
    await expect(request({ op: 'activities.send', command: 'stop' })).rejects.toThrow('malformed_request');
    await expect(request({ op: 'nope' })).rejects.toThrow('unsupported_op');
    await expect(request('hi')).rejects.toThrow('malformed_request');
  });

  it('routes channel requests and posts, and refuses unknown channels', async () => {
    const handler = vi.fn((body: unknown) => ({ echoed: body }));
    bridge = createHudsonBridge({ channels: { scoutSettings: handler } });
    bridge.attach(fake.contents as never);
    expect(await request({ op: 'channel.request', channel: 'scoutSettings', body: { method: 'snapshot' } })).toEqual({
      echoed: { method: 'snapshot' },
    });
    expect(await request({ op: 'channel.post', channel: 'scoutSettings', body: 1 })).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
    await expect(request({ op: 'channel.request', channel: 'scoutGlass' })).rejects.toThrow('No host channel "scoutGlass"');
  });

  it('sends commands, activity and channel events to attached pages only', () => {
    bridge = createHudsonBridge();
    const other = new fake.FakeContents();
    bridge.attach(fake.contents as never);
    bridge.send('tabs.close');
    bridge.publish(recording);
    bridge.emit('scoutSettings', { kind: 'snapshot' });
    expect(fake.contents.sent.map((s) => s.payload)).toEqual([
      { type: 'command', command: 'tabs.close' },
      { type: 'activity', snapshot: recording },
      { type: 'channel', channel: 'scoutSettings', body: { kind: 'snapshot' } },
    ]);
    expect(other.sent).toEqual([]);
    expect(() => bridge!.publish({ nope: 1 } as never)).toThrow();
  });

  it('forgets destroyed pages', () => {
    bridge = createHudsonBridge();
    bridge.attach(fake.contents as never);
    fake.contents.destroy();
    bridge.send('tabs.next');
    expect(fake.contents.sent).toEqual([]);
  });

  it('allows one bridge at a time', () => {
    bridge = createHudsonBridge();
    expect(() => createHudsonBridge()).toThrow('already exists');
    bridge.dispose();
    bridge = createHudsonBridge();
  });
});

describe('preload + hudsonkit adapter, end to end', () => {
  const page = () => {
    const global = createPreloadBridge(electron.ipcRenderer as never);
    return { [HUDSON_ELECTRON_GLOBAL]: global } as unknown as Window;
  };

  it('replays events sent before the page subscribed, and drops stale commands', async () => {
    bridge = createHudsonBridge({ activities: { list: () => [recording], send: () => {} } });
    bridge.attach(fake.contents as never);
    const win = page();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now - 10_000);
    bridge.send('tabs.stale');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    bridge.send('tabs.close');
    bridge.publish(recording);

    const adapter = createElectronAdapter({ window: win });
    const commands: string[] = [];
    const snapshots: ActivitySnapshot[] = [];
    adapter.commands!.subscribe((c) => commands.push(c));
    adapter.activities!.subscribe((s) => snapshots.push(s));
    vi.restoreAllMocks();
    expect(commands).toEqual(['tabs.close']);
    expect(snapshots).toEqual([recording]);
    expect(await adapter.activities!.list()).toEqual([recording]);
  });

  it('carries app channels both ways', async () => {
    bridge = createHudsonBridge({ channels: { scoutSettings: (body) => ({ ok: true, body }) } });
    bridge.attach(fake.contents as never);
    const adapter = createElectronAdapter({ window: page() });
    const settings = adapter.channels!.channel('scoutSettings');
    expect(await settings.request({ method: 'snapshot' })).toEqual({ ok: true, body: { method: 'snapshot' } });
    expect(await adapter.channels!.has('scoutSettings')).toBe(true);
    expect(await adapter.channels!.has('scoutGlass')).toBe(false);

    const pushed: unknown[] = [];
    settings.subscribe((b) => pushed.push(b));
    bridge.emit('scoutSettings', { kind: 'snapshot', theme: 'dark' });
    bridge.emit('scoutCompanion', { ignored: true });
    expect(pushed).toEqual([{ kind: 'snapshot', theme: 'dark' }]);
  });

  it('keeps explicit bridges, and stays inert without the preload', () => {
    const commands = { subscribe: () => () => {} };
    expect(createElectronAdapter({ commands, window: {} as Window }).commands).toBe(commands);
    const bare = createElectronAdapter({ window: {} as Window });
    expect(bare.commands).toBeUndefined();
    expect(bare.channels).toBeUndefined();
    expect(connectElectronBridge({} as Window)).toBeNull();
  });

  it('exposes one global with the protocol version', () => {
    const global = createPreloadBridge(electron.ipcRenderer as never) as ElectronBridgeGlobal;
    expect(global.version).toBe(1);
    expect(fake.rendererListeners.get(HUDSON_ELECTRON_EVENT)?.size).toBe(1);
  });
});

describe('createHudsonWindow', () => {
  it('isolates the page, loads the ready-made preload and attaches the bridge', () => {
    bridge = createHudsonBridge();
    const win = createHudsonWindow({ url: 'http://localhost:3500/demo/tabs', bridge }) as unknown as {
      options: { titleBarStyle: string; webPreferences: Record<string, unknown> };
      loadURL: ReturnType<typeof vi.fn>;
      webContents: InstanceType<typeof fake.FakeContents>;
    };
    expect(win.options.titleBarStyle).toBe('hiddenInset');
    expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, preload: HUDSON_PRELOAD });
    expect(HUDSON_PRELOAD.endsWith('preload.cjs')).toBe(true);
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:3500/demo/tabs');
    bridge.send('tabs.next');
    expect(win.webContents.sent).toEqual([{ channel: HUDSON_ELECTRON_EVENT, payload: { type: 'command', command: 'tabs.next' } }]);
  });
});

describe('hudsonMenuTemplate', () => {
  it('binds the tab commands to their native keys and sends to the focused window only', () => {
    bridge = createHudsonBridge();
    const template = hudsonMenuTemplate({ bridge, onQuitCompletely: () => {} });
    const tabs = template.find((m) => m.label === 'Tabs')!.submenu as Array<{ label: string; accelerator: string; click: (...args: unknown[]) => void }>;
    expect(tabs.map((t) => t.accelerator)).toEqual(TAB_MENU_COMMANDS.map((c) => c.accelerator));
    expect(tabs[0]).toMatchObject({ label: 'Close Tab', accelerator: 'CmdOrCtrl+W' });

    const focused = new fake.FakeContents();
    tabs[0]!.click({}, { webContents: focused });
    expect(focused.sent.map((s) => s.payload)).toEqual([{ type: 'command', command: 'tabs.close' }]);

    const labels = JSON.stringify(template);
    expect(labels).toContain('Quit Completely');
    expect(hudsonMenuTemplate({ bridge, tabCommands: [] }).some((m) => m.label === 'Tabs')).toBe(false);
  });
});
