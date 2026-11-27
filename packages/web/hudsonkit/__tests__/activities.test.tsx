import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '../src/platform/PlatformContext';
import { WEB_ADAPTER } from '../src/platform/defaults';
import type { ActivityRef, ActivitySnapshot, PlatformActivityBridge } from '../src/types/activity';
import { activityStore, useActivities } from '../src/workspace/tabs/activities';
import { ActivityControls, ActivityIndicator, summarizeActivities } from '../src/workspace/tabs/ActivityIndicator';

// ---------------------------------------------------------------------------
// Activities (HUD-015 step 5): the shared per-bridge store, the summary,
// the status-bar indicator and the plain controls.
// ---------------------------------------------------------------------------

const snap = (kind: string, id: string, state: ActivitySnapshot['state'] = 'running', extra: Partial<ActivitySnapshot> = {}): ActivitySnapshot => ({
  ref: { kind, id },
  state,
  lifetime: 'host',
  controls: ['pause', 'resume', 'stop'],
  ...extra,
});

/** An in-memory host: list(), live pushes, and a log of sent commands. */
function fakeBridge(initial: ActivitySnapshot[] = []) {
  const listeners = new Set<(s: ActivitySnapshot) => void>();
  const sent: Array<[ActivityRef, string]> = [];
  let resolveList: ((list: ActivitySnapshot[]) => void) | null = null;
  const bridge: PlatformActivityBridge & { listCalls: number } = {
    listCalls: 0,
    list: vi.fn(() => {
      bridge.listCalls += 1;
      return new Promise<ActivitySnapshot[]>((resolve) => {
        resolveList = resolve;
      });
    }),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    send: vi.fn(async (ref, command) => {
      sent.push([ref, command]);
    }),
  };
  return {
    bridge,
    sent,
    listeners,
    finishList: (list = initial) =>
      act(async () => {
        resolveList?.(list);
      }),
    push: (s: ActivitySnapshot) => act(() => listeners.forEach((l) => l(s))),
  };
}

function Count({ bridge }: { bridge: PlatformActivityBridge }) {
  const activities = useActivities(bridge);
  return <span>{[...activities.values()].map((a) => `${a.ref.id}:${a.state}`).join(',') || 'none'}</span>;
}

afterEach(() => cleanup());

describe('summarizeActivities', () => {
  it('counts live activities by kind, with app words', () => {
    const list = [snap('recording', 'a'), snap('playback', 'b', 'paused'), snap('playback', 'c'), snap('recording', 'd', 'ended')];
    expect(summarizeActivities(list)).toBe('1 recording · 2 playback');
    expect(summarizeActivities(list, { playback: 'playing' })).toBe('1 recording · 2 playing');
    expect(summarizeActivities(list, { recording: (n) => (n === 1 ? 'one take' : `${n} takes`) })).toBe('one take · 2 playback');
    expect(summarizeActivities([snap('x', '1', 'failed')])).toBe('');
  });
});

describe('activity store', () => {
  it('shares one list and one subscription per bridge, and disconnects when unused', async () => {
    const host = fakeBridge([snap('recording', 'r1')]);
    const view = render(
      <>
        <Count bridge={host.bridge} />
        <Count bridge={host.bridge} />
      </>,
    );
    expect(host.bridge.listCalls).toBe(1);
    expect(host.bridge.subscribe).toHaveBeenCalledTimes(1);
    await host.finishList();
    expect(screen.getAllByText('r1:running')).toHaveLength(2);

    view.unmount();
    expect(host.listeners.size).toBe(0);
    expect(activityStore(host.bridge).get().size).toBe(0);
  });

  it('keeps updates that arrive while the list is in flight', async () => {
    const host = fakeBridge();
    render(<Count bridge={host.bridge} />);
    host.push(snap('recording', 'r1', 'paused'));
    // The list was taken before the pause, so it is older.
    await host.finishList([snap('recording', 'r1', 'running'), snap('recording', 'r2')]);
    expect(screen.getByText('r1:paused,r2:running')).toBeTruthy();
  });

  it('reads the platform adapter when no bridge is passed, and nothing without one', async () => {
    const host = fakeBridge([snap('recording', 'r1')]);
    function FromPlatform() {
      const activities = useActivities();
      return <span>{activities.size}</span>;
    }
    render(
      <PlatformProvider adapter={{ ...WEB_ADAPTER, activities: host.bridge }}>
        <FromPlatform />
      </PlatformProvider>,
    );
    await host.finishList();
    expect(screen.getByText('1')).toBeTruthy();
    cleanup();
    render(<FromPlatform />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});

describe('ActivityIndicator', () => {
  it('stays out of the way with nothing to show', async () => {
    const host = fakeBridge([snap('recording', 'r1', 'ended')]);
    const { container } = render(<ActivityIndicator activities={host.bridge} />);
    await host.finishList();
    expect(container.textContent).toBe('');
  });

  it('summarizes, lists every activity, controls it and opens its tab', async () => {
    const host = fakeBridge([
      snap('recording', 'r1', 'running', { title: 'Standup', progress: { position: 75 } }),
      snap('playback', 'p1', 'paused', { title: 'Episode 4', lifetime: 'ui', progress: { position: 30, duration: 3600 } }),
    ]);
    const onOpen = vi.fn();
    render(
      <ActivityIndicator
        activities={host.bridge}
        labels={{ playback: 'playing' }}
        onOpen={onOpen}
        canOpen={(ref) => ref.id === 'r1'}
      />,
    );
    await host.finishList();
    const trigger = screen.getByRole('button', { name: 'Activities: 1 recording · 1 playing' });
    fireEvent.click(trigger);

    await screen.findByText('Standup');
    expect(screen.getByText('1:15')).toBeTruthy();
    expect(screen.getByText('0:30 / 1:00:00')).toBeTruthy();
    expect(screen.getAllByText('· survives quit')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(host.sent.map(([ref, c]) => `${ref.id}:${c}`)).toEqual(['r1:pause', 'p1:resume']));

    const open = screen.getAllByRole('button', { name: 'Open its tab' });
    expect(open).toHaveLength(1);
    fireEvent.click(open[0]!);
    expect(onOpen).toHaveBeenCalledWith({ kind: 'recording', id: 'r1' });
  });

  it('flags activities that failed or whose host is unreachable', async () => {
    const host = fakeBridge([snap('recording', 'r1', 'unreachable')]);
    render(<ActivityIndicator activities={host.bridge} />);
    await host.finishList();
    fireEvent.click(screen.getByRole('button', { name: 'Activities: 1 needs attention' }));
    expect(await screen.findByText('Host not reachable')).toBeTruthy();
  });
});

describe('ActivityControls', () => {
  it('offers only the verbs that apply now', () => {
    const host = fakeBridge();
    const { rerender } = render(<ActivityControls snapshot={snap('recording', 'r1', 'running', { controls: ['stop'] })} bridge={host.bridge} />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    rerender(<ActivityControls snapshot={snap('recording', 'r1', 'ended')} bridge={host.bridge} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('marks a command the host refused', async () => {
    const host = fakeBridge();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.bridge.send = vi.fn(async () => {
      throw new Error('nope');
    });
    render(<ActivityControls snapshot={snap('recording', 'r1')} bridge={host.bridge} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('button', { name: 'Stop failed — try again' })).toBeTruthy();
    error.mockRestore();
  });
});
