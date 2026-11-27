'use client';

// TabShell example (HUD-015 delivery step 4): Hudson chrome around tabs,
// splits and docks, with a seeded first-run layout.
import { TabShell } from 'hudsonkit/workspace';
import { tabsDemoInitialTabs, tabsDemoWorkspace } from '../../apps/tabs-demo';

export default function TabsDemoPage() {
  return <TabShell workspace={tabsDemoWorkspace} initialTabs={tabsDemoInitialTabs} />;
}
