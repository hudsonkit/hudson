'use client';

import { Suspense } from 'react';
import { ThemeProvider } from 'hudsonkit';
import { WorkspaceShell, type WorkspaceShellInitialState } from 'hudsonkit/workspace';
import { coreWorkspaces } from '../../../apps/registry';
import { hudsonShellEnvironment } from '../../../lib/hudsonShellEnvironment';
import { EmbedTour } from './EmbedTour';

export function EmbedWorkspace({
  initialState,
  workspaceIds = [],
}: {
  initialState: WorkspaceShellInitialState;
  /** Extra workspaces to offer in the switcher; the active one is always included. */
  workspaceIds?: string[];
}) {
  const ids = [initialState.activeWorkspaceId, ...workspaceIds.filter(id => id !== initialState.activeWorkspaceId)];
  const embedWorkspaces = ids
    .map(id => coreWorkspaces.find(workspace => workspace.id === id))
    .filter((workspace): workspace is (typeof coreWorkspaces)[number] => Boolean(workspace));

  return (
    <ThemeProvider
      defaultTheme={initialState.theme}
      defaultTemplate={initialState.template}
    >
      <Suspense fallback={null}>
        <WorkspaceShell
          workspaces={embedWorkspaces.length > 0 ? embedWorkspaces : coreWorkspaces}
          defaultWorkspaceId={initialState.activeWorkspaceId}
          bootMode="none"
          persistSession={false}
          initialState={initialState}
          environment={hudsonShellEnvironment}
        />
      </Suspense>
      <EmbedTour />
    </ThemeProvider>
  );
}
