'use client';

import { Suspense } from 'react';
import { ThemeProvider } from 'hudsonkit';
import { WorkspaceShell, type WorkspaceShellInitialState } from 'hudsonkit/workspace';
import { coreWorkspaces } from '../../../apps/registry';
import { hudsonShellEnvironment } from '../../../lib/hudsonShellEnvironment';
import { EmbedTour } from './EmbedTour';

export function EmbedWorkspace({ initialState }: { initialState: WorkspaceShellInitialState }) {
  const embedWorkspaces = coreWorkspaces.filter(workspace => workspace.id === initialState.activeWorkspaceId);

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
