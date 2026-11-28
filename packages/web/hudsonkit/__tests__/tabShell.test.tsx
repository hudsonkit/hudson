import React, { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlatformProvider } from '../src/platform/PlatformContext';
import { WEB_ADAPTER } from '../src/platform/defaults';
import type { HudsonApp } from '../src/types/app';
import type { HudsonWorkspace } from '../src/types/workspace';
import { useTab } from '../src/workspace/tabs/controller';
import { TabShell } from '../src/workspace/tabs/TabShell';

// ---------------------------------------------------------------------------
// TabShell + a native command bridge: menu commands from Electron or a
// WKWebView host must drive the shell's tabs, not only its palette.
// ---------------------------------------------------------------------------

function Note() {
  const { params, setTitle } = useTab();
  const label = (params as { label?: string } | undefined)?.label ?? 'note';
  useEffect(() => setTitle(label), [label, setTitle]);
  return <div>{label}</div>;
}

const noteApp: HudsonApp = {
  id: 'note',
  name: 'Note',
  mode: 'panel',
  multiInstance: 'spawnable',
  Provider: ({ children }) => <>{children}</>,
  slots: { Content: Note },
  hooks: { useCommands: () => [], useStatus: () => ({ label: 'READY', color: 'emerald' }) },
};

const workspace = { id: 'shell-test', name: 'Shell test', apps: [{ app: noteApp }] } as unknown as HudsonWorkspace;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('TabShell with a native command bridge', () => {
  it('runs tab commands the host sends', () => {
    const listeners = new Set<(command: string, args?: unknown) => void>();
    const adapter = {
      ...WEB_ADAPTER,
      commands: {
        subscribe: (fn: (command: string, args?: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      },
    };
    render(
      <PlatformProvider adapter={adapter}>
        <TabShell
          workspace={workspace}
          store={null}
          managedTheme={false}
          initialTabs={[
            { appId: 'note', params: { label: 'a' } },
            { appId: 'note', params: { label: 'b' } },
            { appId: 'note', params: { label: 'c' } },
          ]}
        />
      </PlatformProvider>,
    );
    const send = (command: string) => act(() => listeners.forEach((fn) => fn(command)));
    const selected = () => screen.getByRole('tab', { selected: true }).getAttribute('aria-label')!.split(',')[0];

    send('tabs.select.1');
    expect(selected()).toBe('a');
    send('tabs.next');
    expect(selected()).toBe('b');
    send('tabs.select.3');
    expect(selected()).toBe('c');
    send('tabs.close');
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label')!.split(',')[0])).toEqual(['a', 'b']);
  });
});
