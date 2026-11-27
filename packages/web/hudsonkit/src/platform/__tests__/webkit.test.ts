import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { ActivitySnapshot } from '../../types/activity';
import { HUDSON_BRIDGE_BUFFER_LIMIT, HUDSON_BRIDGE_GLOBAL, hudsonBridgeBootstrapScript } from '../bridgeProtocol';
import { connectWebKitBridge, createWebKitAdapter, isWebKitHost } from '../webkit';

const snapshot = (id: string, state: ActivitySnapshot['state'] = 'running'): ActivitySnapshot => ({
  ref: { kind: 'recording', id },
  state,
  lifetime: 'host',
  controls: ['pause', 'stop'],
});

/** A fake WKWebView page: a window with a message handler, plus the host's evaluate. */
function fakeHost(reply: (message: unknown) => unknown = () => null) {
  const posted: unknown[] = [];
  const win = {
    webkit: {
      messageHandlers: {
        hudsonBridge: {
          postMessage: vi.fn(async (message: unknown) => {
            posted.push(message);
            return reply(message);
          }),
        },
      },
    },
  } as unknown as Window & Record<string, unknown>;
  // What the host's user script does at document start.
  new Function('window', hudsonBridgeBootstrapScript())(win);
  const evaluate = (event: unknown) => (win[HUDSON_BRIDGE_GLOBAL] as { receive(e: unknown): void }).receive(event);
  return { win, posted, evaluate };
}

describe('WKWebView adapter', () => {
  test('outside a host it has no bridges', () => {
    const win = {} as Window;
    expect(isWebKitHost({ window: win })).toBe(false);
    expect(connectWebKitBridge({ window: win })).toBeNull();
    const adapter = createWebKitAdapter({ window: win });
    expect(adapter.commands).toBeUndefined();
    expect(adapter.activities).toBeUndefined();
    expect(adapter.isSSR).toBe(false);
    expect(adapter.dragRegionProps).toEqual({});
  });

  test('replays events the bootstrap buffered before the adapter connected', () => {
    const { win, evaluate } = fakeHost();
    evaluate({ type: 'command', command: 'tabs.next' });
    evaluate({ type: 'activity', snapshot: snapshot('r1') });
    const adapter = createWebKitAdapter({ window: win });
    const commands: string[] = [];
    const activities: string[] = [];
    adapter.commands!.subscribe((c) => commands.push(c));
    adapter.activities!.subscribe((s) => activities.push(s.ref.id));
    expect(commands).toEqual(['tabs.next']);
    expect(activities).toEqual(['r1']);
  });

  test('drops buffered commands that went stale, keeps activity updates', () => {
    const { win, evaluate } = fakeHost();
    vi.useFakeTimers();
    try {
      evaluate({ type: 'command', command: 'tabs.close' });
      evaluate({ type: 'activity', snapshot: snapshot('r1') });
      vi.advanceTimersByTime(5000);
      const bridge = connectWebKitBridge({ window: win })!;
      const commands: string[] = [];
      const activities: string[] = [];
      bridge.commands.subscribe((c) => commands.push(c));
      bridge.activities.subscribe((s) => activities.push(s.ref.id));
      expect(commands).toEqual([]);
      expect(activities).toEqual(['r1']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('delivers live events with args, to every subscriber, until unsubscribed', () => {
    const { win, evaluate } = fakeHost();
    const bridge = connectWebKitBridge({ window: win })!;
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = bridge.commands.subscribe((c, args) => a.push([c, args]));
    bridge.commands.subscribe((c) => b.push(c));
    evaluate({ type: 'command', command: 'tabs.open', args: { appId: 'notes' } });
    offA();
    evaluate({ type: 'command', command: 'tabs.next' });
    expect(a).toEqual([['tabs.open', { appId: 'notes' }]]);
    expect(b).toEqual(['tabs.open', 'tabs.next']);
  });

  test('ignores malformed events', () => {
    const { win, evaluate } = fakeHost();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bridge = connectWebKitBridge({ window: win })!;
    const got: unknown[] = [];
    bridge.activities.subscribe((s) => got.push(s));
    evaluate({ type: 'activity', snapshot: { ref: { kind: 'x' } } });
    evaluate('nonsense');
    expect(got).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test('shares one connection per window', () => {
    const { win } = fakeHost();
    expect(connectWebKitBridge({ window: win })).toBe(connectWebKitBridge({ window: win }));
    expect(createWebKitAdapter({ window: win }).commands).toBe(createWebKitAdapter({ window: win }).commands);
  });

  test('requests go through the message handler and replies are validated', async () => {
    const { win, posted } = fakeHost((message) => {
      const op = (message as { op: string }).op;
      if (op === 'activities.list') return [snapshot('r1'), { junk: true }];
      if (op === 'hello') return { version: 1, capabilities: ['commands', 'activities', 7] };
      return null;
    });
    const bridge = connectWebKitBridge({ window: win })!;
    const list = await bridge.activities.list();
    expect(list.map((s) => s.ref.id)).toEqual(['r1']);
    await bridge.activities.send({ kind: 'recording', id: 'r1' }, 'stop');
    expect(await bridge.hello()).toEqual({ version: 1, capabilities: ['commands', 'activities'] });
    expect(posted).toEqual([
      { op: 'activities.list' },
      { op: 'activities.send', ref: { kind: 'recording', id: 'r1' }, command: 'stop', args: undefined },
      { op: 'hello', version: 1 },
    ]);
  });

  test('host errors reject the request', async () => {
    const { win } = fakeHost(() => {
      throw new Error('no_activity_host');
    });
    const bridge = connectWebKitBridge({ window: win })!;
    await expect(bridge.activities.send({ kind: 'k', id: '1' }, 'stop')).rejects.toThrow('no_activity_host');
  });

  test('can opt out of either bridge', () => {
    const { win } = fakeHost();
    const adapter = createWebKitAdapter({ window: win, activities: false, titleBarInset: 12 });
    expect(adapter.commands).toBeDefined();
    expect(adapter.activities).toBeUndefined();
    expect(adapter.titleBarInset).toBe(12);
  });
});

describe('bridge protocol', () => {
  test('the bootstrap buffer is bounded', () => {
    const win = {} as Record<string, unknown>;
    new Function('window', hudsonBridgeBootstrapScript())(win);
    const global = win[HUDSON_BRIDGE_GLOBAL] as { receive(e: unknown): void; queue: unknown[] };
    for (let i = 0; i < HUDSON_BRIDGE_BUFFER_LIMIT + 5; i++) global.receive({ type: 'command', command: String(i) });
    expect(global.queue).toHaveLength(HUDSON_BRIDGE_BUFFER_LIMIT);
  });

  test('the Swift bootstrap template matches this one', () => {
    const swift = readFileSync(
      resolve(__dirname, '../../../../../native/apple/HudsonKit/Sources/HudsonUIWeb/HudWebBridge.swift'),
      'utf8',
    );
    const template = /static let bootstrapTemplate = "(.*)"\n/.exec(swift)?.[1];
    expect(template).toBeDefined();
    const fromSwift = template!.replace('__KEY__', JSON.stringify(HUDSON_BRIDGE_GLOBAL)).replace('__LIMIT__', String(HUDSON_BRIDGE_BUFFER_LIMIT));
    expect(fromSwift).toBe(hudsonBridgeBootstrapScript());
    expect(swift).toContain(`defaultHandlerName = "hudsonBridge"`);
    expect(swift).toContain(`defaultGlobalName = "${HUDSON_BRIDGE_GLOBAL}"`);
  });
});
