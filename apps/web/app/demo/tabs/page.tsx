'use client';

// TabShell example (HUD-015 delivery steps 4 and 5): Hudson chrome around
// tabs, splits and docks, with a seeded first-run layout. The demo's
// simulated recording host feeds the status-bar activity indicator.
//
// Inside @hudsonkit/electron's example window (packages/web/electron/example)
// the page picks up the preload bridge, so the app menu's tab commands
// (⌘W, ⌃⇥, ⌘1–9…) drive the shell.
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createElectronAdapter, isElectronHost, PlatformProvider, type PlatformAdapter } from 'hudsonkit';
import { TabShell } from 'hudsonkit/workspace';
import { demoRecordingHost, tabsDemoInitialTabs, tabsDemoWorkspace } from '../../apps/tabs-demo';

const noSubscribe = () => () => {};

/** Wraps in the Electron adapter once hydrated; the static render and hydration see the web. */
function ElectronWhenHosted({ children }: { children: ReactNode }) {
  const hosted = useSyncExternalStore(noSubscribe, () => isElectronHost(), () => false);
  const adapter = useMemo<PlatformAdapter | null>(() => (hosted ? createElectronAdapter() : null), [hosted]);
  return adapter ? <PlatformProvider adapter={adapter}>{children}</PlatformProvider> : <>{children}</>;
}

export default function TabsDemoPage() {
  return (
    <ElectronWhenHosted>
      <TabShell
        workspace={tabsDemoWorkspace}
        initialTabs={tabsDemoInitialTabs}
        activities={demoRecordingHost}
        activityLabels={{ recording: 'recording' }}
      />
    </ElectronWhenHosted>
  );
}
