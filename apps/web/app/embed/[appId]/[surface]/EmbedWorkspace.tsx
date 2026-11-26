'use client';

import { Suspense, useEffect } from 'react';
import { ThemeProvider } from 'hudsonkit';
import { WorkspaceShell, type WorkspaceShellInitialState } from 'hudsonkit/workspace';
import { coreWorkspaces } from '../../../apps/registry';
import { hudsonShellEnvironment } from '../../../lib/hudsonShellEnvironment';
import { EmbedTour } from './EmbedTour';

export function EmbedWorkspace({
  initialState,
  workspaceIds = [],
  accent,
}: {
  initialState: WorkspaceShellInitialState;
  /** Accent override as an oklch triplet (from `accent=ember`). */
  accent?: string;
  /** Extra workspaces to offer in the switcher; the active one is always included. */
  workspaceIds?: string[];
}) {
  const ids = [initialState.activeWorkspaceId, ...workspaceIds.filter(id => id !== initialState.activeWorkspaceId)];
  const embedWorkspaces = ids
    .map(id => coreWorkspaces.find(workspace => workspace.id === id))
    .filter((workspace): workspace is (typeof coreWorkspaces)[number] => Boolean(workspace));

  usePaintedSignal();

  return (
    <ThemeProvider
      defaultTheme={initialState.theme}
      defaultTemplate={initialState.template}
    >
      {accent && <EmbedAccent triplet={accent} />}
      <Suspense fallback={null}>
        <WorkspaceShell
          workspaces={embedWorkspaces.length > 0 ? embedWorkspaces : coreWorkspaces}
          defaultWorkspaceId={initialState.activeWorkspaceId}
          bootMode="none"
          persistSession={false}
          initialState={initialState}
          environment={hudsonShellEnvironment}
          autoArrange
          showDecor={false}
        />
      </Suspense>
      <EmbedTour />
    </ThemeProvider>
  );
}

/**
 * Tell the host page once the workspace has really painted: the windows are
 * arranged on the canvas and fonts are ready. The host's reveal waits for this, so the
 * shell never appears half-assembled.
 */
function usePaintedSignal() {
  useEffect(() => {
    if (window.parent === window) return;
    let cancelled = false;
    const started = performance.now();

    const post = () => {
      if (cancelled) return;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (!cancelled) window.parent.postMessage({ type: 'hudson:embed-painted' }, '*');
        }),
      );
    };

    // The shell tiles + fits the windows once it has measured the canvas and
    // then fires `hudson:canvas-arranged`; reveal after that so nothing moves
    // under the reveal. Fall back to "a window exists" after 2.5s.
    let arranged = false;
    const onArranged = () => {
      arranged = true;
    };
    window.addEventListener('hudson:canvas-arranged', onArranged, { once: true });

    const waitForCanvas = () => {
      if (cancelled) return;
      const hasWindow = document.querySelector('[data-app-window]');
      const elapsed = performance.now() - started;
      if ((arranged && hasWindow) || (hasWindow && elapsed > 2500) || elapsed > 4000) {
        (document.fonts?.ready ?? Promise.resolve()).then(post, post);
      } else {
        window.requestAnimationFrame(waitForCanvas);
      }
    };
    waitForCanvas();

    return () => {
      cancelled = true;
      window.removeEventListener('hudson:canvas-arranged', onArranged);
    };
  }, []);
}

/**
 * Demo theming for the embed: re-point the template's accent tokens (they are
 * defined on several nested [data-hudson-template] elements, so the override
 * is !important), quiet the status bar (no green "ready"/"logs" dots), and
 * calm window chrome: neutral focus border, flat title bar, no glows.
 */
function EmbedAccent({ triplet }: { triplet: string }) {
  const css = `
[data-hudson-template] {
  --accent: ${triplet} !important;
  --primary: ${triplet} !important;
  --ring: ${triplet} !important;
  --hud-accent: oklch(${triplet}) !important;
  --hud-accent-soft: oklch(${triplet} / 0.12) !important;
  --hud-accent-line: oklch(${triplet} / 0.42) !important;
  --hud-nav-live: oklch(${triplet}) !important;
}
[data-frame-panel="status-bar"] .bg-success { display: none !important; }
[data-frame-panel="status-bar"] .text-success { color: oklch(var(--muted-foreground)) !important; }

/* Windows: neutral hairline when focused, flat title bar, no decorative
   shadows or glows. Accent stays out of content; it marks state only. */
[data-app-window] [class*="border-accent"] { border-color: oklch(var(--foreground) / 0.16) !important; }
[data-app-window] .bg-gradient-to-r { background-image: none !important; background-color: oklch(var(--card)) !important; }
[data-app-window] [class*="shadow"]:not(:focus-visible),
[data-app-window] [style*="box-shadow"] { box-shadow: none !important; }
[data-app-window] [class*="text-accent"] { color: oklch(var(--foreground) / 0.86) !important; }
`;
  return <style data-embed-accent>{css}</style>;
}
