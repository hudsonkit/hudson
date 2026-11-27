'use client';

import { Suspense, useEffect } from 'react';
import { ThemeProvider } from 'hudsonkit';
import { WorkspaceShell, type WorkspaceShellInitialState } from 'hudsonkit/workspace';
import { coreWorkspaces } from '../../../apps/registry';
import { hudsonShellEnvironment } from '../../../lib/hudsonShellEnvironment';
import { EmbedDriver } from './EmbedDriver';
import { panelsToOpenWhenWide } from '../../initial-state';

/** Frames at least this wide have room for a side panel beside the canvas. */
const WIDE_FRAME = 960;

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
  useOpenPanelsWhenWide();

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
      <EmbedDriver />
    </ThemeProvider>
  );
}

/**
 * `collapse=right:narrow`: the panel starts closed (phones, small frames) and
 * opens as soon as the shell mounts when the frame is wide; the shell re-tiles
 * around it and the first view shows the inspector working.
 */
function useOpenPanelsWhenWide() {
  useEffect(() => {
    if (window.innerWidth < WIDE_FRAME) return;
    const sides = panelsToOpenWhenWide(new URLSearchParams(window.location.search).get('collapse'));
    if (sides.length === 0) return;
    // Ask until the panel is actually open: the shell's listener and its
    // initial-state restore both land after first paint, in either order.
    const selector: Record<'left' | 'right', string> = {
      left: '[data-frame-panel="manifest"]',
      right: '[data-frame-panel="inspector"]',
    };
    let frame = 0;
    let lastAsk = 0;
    const started = performance.now();
    const tryOpen = (now: number) => {
      const pending = sides.filter(side => !document.querySelector(selector[side]));
      if (pending.length === 0 || now - started > 4000) return;
      if (now - lastAsk > 200) {
        lastAsk = now;
        for (const side of pending) {
          window.dispatchEvent(new CustomEvent('hudson:set-panel-collapsed', { detail: { side, collapsed: false } }));
        }
      }
      frame = window.requestAnimationFrame(tryOpen);
    };
    frame = window.requestAnimationFrame(tryOpen);
    return () => window.cancelAnimationFrame(frame);
  }, []);
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
 * Optional accent override for the embed (`accent=<preset>`). The template
 * defines its accent tokens on several nested [data-hudson-template]
 * elements, so the override is !important. Calm chrome (neutral focus
 * border, flat title bars, quiet status bar) lives in hudsonkit itself.
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
`;
  return <style data-embed-accent>{css}</style>;
}
