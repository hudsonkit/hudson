/**
 * Hudson Embed Client Entry
 *
 * This is the standalone React mount point used by the embed Worker's HTML.
 * It reads `window.__HUDSON_INITIAL__` (placed by the Worker) and mounts
 * the embed surface without depending on Next.js RSC hydration.
 *
 * The Worker serves a hand-crafted HTML shell that includes this bundled
 * script. This keeps the mount self-contained so the Worker's HTML works
 * whether or not Next.js RSC infrastructure is present.
 *
 * Bundle with:
 *   bun run embed:bundle
 * (defined in root package.json, uses esbuild)
 *
 * Output: public/embed/client.js (served statically from Pages)
 */

import { createRoot } from 'react-dom/client';
import { EmbedDocs } from './[appId]/[surface]/EmbedDocs';
import { EmbedHandshake } from './[appId]/[surface]/EmbedHandshake';
import { EmbedVoice } from './[appId]/[surface]/EmbedVoice';
import { EmbedWorkspace } from './[appId]/[surface]/EmbedWorkspace';
import type { WorkspaceShellInitialState } from 'hudsonkit/workspace';
import { parseCollapse, parseWorkspaceIds } from './initial-state';

// ── Read initial state injected by the Worker ─────────────────────────────────

declare global {
  interface Window {
    __HUDSON_INITIAL__?: {
      appId?: string;
      surface?: string;
      ref?: string;
      template: string;
      theme: 'dark' | 'light';
      activeWorkspaceId: string;
      focusedAppId: string;
      activatedAppIds: string[];
      palette?: Record<string, string>;
      fonts?: Record<string, string>;
    };
  }
}

const workerState = window.__HUDSON_INITIAL__;
const surface = workerState?.surface ?? 'workspace';

// Build WorkspaceShellInitialState from the Worker-resolved state.
// tileWindowBounds is not known at Worker time — the shell defaults it.
const initialState: WorkspaceShellInitialState = workerState
  ? {
      activeWorkspaceId: workerState.activeWorkspaceId,
      activatedAppIds: workerState.activatedAppIds,
      focusedAppId: workerState.focusedAppId,
      tileWindowBounds: {}, // shell computes per-workspace defaults
      theme: workerState.theme,
      template: workerState.template,
    }
  : {
      activeWorkspaceId: 'hudson-os',
      activatedAppIds: ['hudson-docs'],
      focusedAppId: 'hudson-docs',
      tileWindowBounds: {},
      theme: 'dark',
      template: 'hudson',
    };

// URL-level overrides that also apply on the Worker path (static HTML shell).
const urlParams = new URLSearchParams(window.location.search);
const collapse = parseCollapse(urlParams.get('collapse'));
const workspaceIds = parseWorkspaceIds(urlParams.get('workspaces'));
Object.assign(initialState, collapse);

// ── Mount ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('hudson-embed-root');

function EmbedSurface() {
  if (surface === 'voice') return <EmbedVoice />;
  if (surface === 'docs') return <EmbedDocs />;
  if (surface === 'workspace') return <EmbedWorkspace initialState={initialState} workspaceIds={workspaceIds} />;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--hud-bg, oklch(0.16 0.005 240))',
        color: 'var(--hud-ink-2, oklch(0.66 0.008 240))',
        fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
        fontSize: 12,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      surface · {surface}
    </div>
  );
}

function EmbedClientRoot() {
  return (
    <>
      <EmbedHandshake surface={surface} />
      <EmbedSurface />
    </>
  );
}

if (rootEl) {
  createRoot(rootEl).render(<EmbedClientRoot />);
} else {
  console.error('[embed-client] #hudson-embed-root not found — mount failed');
}
