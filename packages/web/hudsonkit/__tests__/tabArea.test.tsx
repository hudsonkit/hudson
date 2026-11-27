import React, { createRef, useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '../src/platform/PlatformContext';
import { WEB_ADAPTER } from '../src/platform/defaults';
import type { PlatformActivityBridge } from '../src/types/activity';
import type { HudsonApp } from '../src/types/app';
import type { TabWorkspaceState } from '../src/types/tabs';
import { useTab, type TabsHandle } from '../src/workspace/tabs/controller';
import { createLayout } from '../src/workspace/tabs/layout';
import { createMemoryTabStore } from '../src/workspace/tabs/store';
import { TabArea } from '../src/workspace/tabs/TabArea';

// ---------------------------------------------------------------------------
// TabArea + controller (HUD-015 step 4): lazy mount, stable content across
// moves, held work, onClose, reopen, reuse, restore, commands, keyboard.
// ---------------------------------------------------------------------------

const mounts: string[] = [];
const closes: string[] = [];

function CounterContent() {
  const tab = useTab();
  const [count, setCount] = useState(0);
  const label = (tab.params as { label?: string } | undefined)?.label ?? 'counter';
  const { setTitle, onClose, instanceId } = tab;
  useEffect(() => {
    mounts.push(instanceId);
  }, [instanceId]);
  useEffect(() => setTitle(label), [label, setTitle]);
  useEffect(() => onClose(() => closes.push(instanceId)), [instanceId, onClose]);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      {label}:{count}:{tab.visible ? 'visible' : 'hidden'}
    </button>
  );
}

function HoldContent() {
  const { holdWork } = useTab();
  useEffect(() => holdWork('The recording'), [holdWork]);
  return <div>holding</div>;
}

function makeApp(id: string, Content: React.FC, tab?: HudsonApp['tab']): HudsonApp {
  return {
    id,
    name: id,
    mode: 'panel',
    multiInstance: 'spawnable',
    tab,
    Provider: ({ children }) => <>{children}</>,
    slots: { Content },
    hooks: { useCommands: () => [], useStatus: () => ({ label: 'READY', color: 'emerald' }) },
  };
}

const counterApp = makeApp('counter', CounterContent, {
  reuseKey: (p) => (p as { label?: string } | undefined)?.label ?? null,
  activityRef: (p) => ((p as { rec?: string } | undefined)?.rec ? { kind: 'recording', id: (p as { rec: string }).rec } : null),
});
const holdApp = makeApp('hold', HoldContent);
const apps = [counterApp, holdApp];

let seq = 0;
const newInstanceId = (appId: string) => `${appId}-${++seq}`;

function renderArea(props: Partial<React.ComponentProps<typeof TabArea>> = {}) {
  const ref = createRef<TabsHandle>();
  const utils = render(
    <div style={{ width: 1200, height: 800 }}>
      <TabArea
        ref={ref}
        apps={apps}
        newInstanceId={newInstanceId}
        initialTabs={[
          { appId: 'counter', params: { label: 'one' } },
          { appId: 'counter', params: { label: 'two' } },
          { appId: 'counter', params: { label: 'three' } },
        ]}
        {...props}
      />
    </div>,
  );
  return { ref, ...utils };
}

const tabNames = () => screen.queryAllByRole('tab').map((t) => t.getAttribute('aria-label')!.split(',')[0]);

beforeEach(() => {
  mounts.length = 0;
  closes.length = 0;
  seq = 0;
  // jsdom has no layout; give every element a box so tab content gets placed.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('TabArea', () => {
  it('opens the seed tabs and mounts only the active one (lazy restore)', () => {
    renderArea();
    expect(tabNames()).toEqual(['one', 'counter', 'counter']);
    expect(mounts).toEqual(['counter-1']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'one');
  });

  it('mounts a tab on first focus and keeps the previous one mounted but hidden', () => {
    renderArea();
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(mounts).toEqual(['counter-1', 'counter-2']);
    expect(screen.getByText('one:0:hidden')).toBeInTheDocument();
    expect(screen.getByText('two:0:visible')).toBeInTheDocument();
  });

  it('keeps tab state when a tab moves to a split or a dock (no remount)', () => {
    const { ref } = renderArea();
    fireEvent.click(screen.getByText('one:0:visible'));
    fireEvent.click(screen.getByText('one:1:visible'));
    act(() => ref.current!.move('counter-1', 'right'));
    act(() => ref.current!.move('counter-1', { dock: 'bottom' }));
    expect(screen.getByText('one:2:visible')).toBeInTheDocument();
    expect(mounts.filter((id) => id === 'counter-1')).toHaveLength(1);
  });

  it('closes, focuses the right neighbour, and runs onClose once', () => {
    renderArea();
    fireEvent.click(screen.getByRole('button', { name: 'Close one' }));
    expect(tabNames()).toEqual(['two', 'counter']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'two');
    expect(closes).toEqual(['counter-1']);
  });

  it('does not run onClose on unmount', () => {
    const { unmount } = renderArea();
    unmount();
    expect(closes).toEqual([]);
  });

  it('asks before closing a tab that holds work', () => {
    const { ref } = renderArea({ initialTabs: [{ appId: 'hold' }, { appId: 'counter' }] });
    act(() => ref.current!.close('hold-1'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('The recording will stop.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(tabNames()).toContain('hold');
    act(() => ref.current!.close('hold-1'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Close tab' }));
    expect(tabNames()).not.toContain('hold');
    expect(ref.current!.heldWork()).toEqual([]);
  });

  it('reports held work for a native quit prompt', () => {
    const { ref } = renderArea({ initialTabs: [{ appId: 'hold', title: 'Mic' }] });
    expect(ref.current!.heldWork()).toEqual([{ instanceId: 'hold-1', title: 'Mic', label: 'The recording' }]);
  });

  it('reopens the last closed tab where it was', () => {
    const { ref } = renderArea();
    fireEvent.click(screen.getByRole('button', { name: 'Close one' }));
    act(() => ref.current!.reopen());
    expect(tabNames()).toEqual(['one', 'two', 'counter']);
  });

  it('reuses a tab by its reuse key', () => {
    const { ref } = renderArea();
    let id = '';
    act(() => {
      id = ref.current!.open({ appId: 'counter', params: { label: 'three' } }, { reuse: true });
    });
    expect(id).toBe('counter-3');
    expect(tabNames()).toHaveLength(3);
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'three');
    expect(ref.current!.find('counter', 'two')?.instanceId).toBe('counter-2');
  });

  it('opens inactive without moving focus', () => {
    const { ref } = renderArea();
    act(() => {
      ref.current!.open({ appId: 'counter', params: { label: 'bg' } }, { inactive: true, placement: { dock: 'right' } });
    });
    expect(screen.getByRole('tab', { selected: true, name: 'one' })).toBeInTheDocument();
    expect(document.querySelector('[data-dock="right"]')).not.toBeNull();
  });

  it('runs tab commands: select by number, cycle, open with args', () => {
    const { ref } = renderArea();
    act(() => void ref.current!.runCommand('tabs.select.3'));
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'three');
    act(() => void ref.current!.runCommand('tabs.next'));
    expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-label', 'one');
    act(() => void ref.current!.runCommand('tabs.open', { request: { appId: 'counter', params: { label: 'four' } } }));
    expect(tabNames()).toContain('four');
    expect(ref.current!.runCommand('tabs.open', { request: { appId: 'nope' } })).toBe(false);
    expect(ref.current!.runCommand('unknown.command')).toBe(false);
  });

  it('follows the native command bridge and binds no page keys', () => {
    let emit: (command: string, args?: unknown) => void = () => {};
    const adapter = {
      ...WEB_ADAPTER,
      commands: {
        subscribe: (listener: typeof emit) => {
          emit = listener;
          return () => {};
        },
      },
    };
    render(
      <PlatformProvider adapter={adapter}>
        <TabArea apps={apps} newInstanceId={newInstanceId} keyBindings initialTabs={[{ appId: 'counter', params: { label: 'a' } }, { appId: 'counter', params: { label: 'b' } }]} />
      </PlatformProvider>,
    );
    act(() => emit('tabs.close'));
    expect(tabNames()).toEqual(['b']);
    fireEvent.keyDown(window, { key: 'w', metaKey: true });
    expect(tabNames()).toEqual(['b']);
  });

  it('binds page keys only when asked', () => {
    renderArea({ keyBindings: { 'tabs.close': 'Alt+W' } });
    fireEvent.keyDown(window, { key: 'w', code: 'KeyW', altKey: true });
    expect(tabNames()).toEqual(['two', 'counter']);
  });

  it('supports the keyboard: arrows move, Enter selects, Delete closes', () => {
    renderArea();
    const [first, second] = screen.getAllByRole('tab');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'Enter' });
    expect(second).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(second!, { key: 'Delete' });
    // Focus moves to the right neighbour, which mounts and titles itself.
    expect(tabNames()).toEqual(['one', 'three']);
  });

  it('closes on middle-click', () => {
    renderArea();
    fireEvent(screen.getAllByRole('tab')[0]!, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(tabNames()).toEqual(['two', 'counter']);
  });

  it('shows activity state from the bridge on unmounted tabs', async () => {
    const bridge: PlatformActivityBridge = {
      list: async () => [{ ref: { kind: 'recording', id: 'r1' }, state: 'running', lifetime: 'host', controls: ['stop'] }],
      subscribe: () => () => {},
      send: async () => {},
    };
    renderArea({
      activities: bridge,
      initialTabs: [{ appId: 'counter', params: { label: 'a' } }, { appId: 'counter', params: { label: 'rec', rec: 'r1' } }],
    });
    await waitFor(() => expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-label', 'counter, live'));
    expect(mounts).toEqual(['counter-1']);
  });
});

describe('TabArea persistence', () => {
  it('restores a saved workspace, with tombstones for unknown apps', async () => {
    const newId = (() => {
      let n = 0;
      return () => `g${++n}`;
    })();
    const savedState: TabWorkspaceState = {
      instances: [
        { instanceId: 'x1', appId: 'counter', title: 'saved one', params: { label: 'restored' } },
        { instanceId: 'x2', appId: 'retired-app', title: 'Old tool' },
      ],
      layout: createLayout(newId, ['x2', 'x1']),
      recentlyClosed: [],
    };
    const store = createMemoryTabStore({ 'hudson.tabs:ws:main': savedState });
    renderArea({ store, storeKey: { workspaceId: 'ws' }, initialTabs: [] });
    await waitFor(() => expect(tabNames()).toEqual(['Old tool', 'saved one']));
    expect(screen.getByText('The app for this tab isn’t available here.')).toBeInTheDocument();
    expect(mounts).toEqual([]);
  });

  it('saves after changes, debounced, without non-persisting tabs', async () => {
    const store = createMemoryTabStore();
    const transient = makeApp('transient', () => <div>t</div>, { persists: false });
    const { ref } = renderArea({ store, storeKey: { workspaceId: 'ws' }, apps: [...apps, transient] });
    await waitFor(() => expect(tabNames()).toHaveLength(3));
    act(() => void ref.current!.open({ appId: 'transient' }));
    await waitFor(() => expect(store.snapshot({ workspaceId: 'ws', windowId: 'main' })?.instances).toHaveLength(3), { timeout: 2000 });
    expect(store.snapshot({ workspaceId: 'ws', windowId: 'main' })!.instances.map((i) => i.appId)).not.toContain('transient');
  });
});

describe('useTab outside a TabArea', () => {
  it('sets the window title and makes the strip calls no-ops', () => {
    function Solo() {
      const tab = useTab();
      useEffect(() => {
        tab.setTitle('Solo window');
        tab.setBadge(3);
        expect(tab.holdWork('x')).toBeTypeOf('function');
      }, [tab]);
      return null;
    }
    render(<Solo />);
    expect(document.title).toBe('Solo window');
  });
});
