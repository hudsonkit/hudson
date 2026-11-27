'use client';

// TabShell example (HUD-015 delivery steps 4 and 5): Hudson chrome around
// tabs, splits and docks, with a seeded first-run layout. The demo's
// simulated recording host feeds the status-bar activity indicator.
import { TabShell } from 'hudsonkit/workspace';
import { demoRecordingHost, tabsDemoInitialTabs, tabsDemoWorkspace } from '../../apps/tabs-demo';

export default function TabsDemoPage() {
  return (
    <TabShell
      workspace={tabsDemoWorkspace}
      initialTabs={tabsDemoInitialTabs}
      activities={demoRecordingHost}
      activityLabels={{ recording: 'recording' }}
    />
  );
}
