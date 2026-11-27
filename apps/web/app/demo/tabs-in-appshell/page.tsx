'use client';

// AppShell with a <TabArea> in its content (HUD-015 §2): the shape Scout's
// watch area uses. The host app keeps its own chrome; tabs live inside it.
import { createElement } from 'react';
import type { HudsonApp } from 'hudsonkit';
import { AppShell } from 'hudsonkit/app-shell';
import { TabArea, createMemoryTabStore } from 'hudsonkit/workspace';
import { LayoutGrid } from 'hudsonkit/icons';
import { notesApp, stopwatchApp } from '../../apps/tabs-demo';

const innerApps = [notesApp, stopwatchApp];
const store = createMemoryTabStore();

function WatchArea() {
  return (
    <TabArea
      apps={innerApps}
      store={store}
      storeKey={{ workspaceId: 'demo-watch' }}
      initialTabs={[{ appId: 'tabs-notes' }, { appId: 'tabs-stopwatch', placement: 'right' }]}
      emptyState="Nothing on the watch list"
    />
  );
}

const watchApp: HudsonApp = {
  id: 'demo-watch',
  name: 'Watch',
  mode: 'panel',
  icon: createElement(LayoutGrid, { size: 12 }),
  Provider: ({ children }) => <>{children}</>,
  slots: { Content: WatchArea },
  hooks: { useCommands: () => [], useStatus: () => ({ label: 'READY', color: 'emerald' }) },
};

export default function TabsInAppShellDemo() {
  return <AppShell app={watchApp} />;
}
