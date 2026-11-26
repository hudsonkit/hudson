// ─────────────────────────────────────────────────────────────────────────────
// Hudson Embed Surface Route — RFC v0.3 §2 / §12
// ─────────────────────────────────────────────────────────────────────────────
// Renders an embeddable Hudson surface inside an iframe served by a host
// (e.g. hudsonos marketing site). The page is a Server Component: it resolves
// the consumer from `?ref=`, bakes the matching `data-hudson-template` /
// `data-hudson-theme` and `--hud-*` tokens onto the wrapper at SSR time, and
// hands the postMessage handshake to a small client child. First paint already
// has the correct theme — no flash, no re-render.
//
// All template × theme combos live in the bundled tokens.css, so client-side
// theme changes (postMessage `hudson:theme-sync`, or a parent flipping
// `data-hudson-theme`) repaint instantly without a server roundtrip.
//
// Reference structural blueprint:
//   https://github.com/arach/hudsonos/blob/homepage-polish/app/embed/workspace/page.tsx
// Host reference impl:
//   https://github.com/arach/hudsonos/blob/homepage-polish/app/_site/lib/embed.tsx
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import { consumers, consumerThemeStyle } from '../../registry';
import { parseAccent, parseWorkspaceIds, resolveEmbedInitialState, type EmbedSearchParams } from '../../initial-state';
import { getCoreWorkspaces } from '../../../apps/registry';
import { EmbedHandshake } from './EmbedHandshake';
import { EmbedWorkspace } from './EmbedWorkspace';
import { EmbedVoice } from './EmbedVoice';
import { EmbedDocs } from './EmbedDocs';

interface EmbedPageProps {
  params: Promise<{ appId: string; surface: string }>;
  searchParams: Promise<EmbedSearchParams>;
}

export default async function EmbedPage({ params, searchParams }: EmbedPageProps) {
  const { appId, surface } = await params;
  const sp = await searchParams;
  const initialState = resolveEmbedInitialState(sp, consumers, getCoreWorkspaces());
  const ref = initialState.ref;
  const themeStyle = consumerThemeStyle(ref);

  if (surface === 'workspace') {
    return (
      <div
        data-hudson-ref={ref}
        data-hudson-template={initialState.template}
        data-hudson-theme={initialState.theme}
        data-hudson-workspace={initialState.activeWorkspaceId}
        data-hudson-focus={initialState.focusedAppId}
        style={{ ...themeStyle, minHeight: '100vh' } as CSSProperties}
      >
        <EmbedHandshake surface={surface} />
        <EmbedWorkspace
          initialState={initialState}
          workspaceIds={parseWorkspaceIds(Array.isArray(sp.workspaces) ? sp.workspaces[0] : sp.workspaces)}
          accent={parseAccent(Array.isArray(sp.accent) ? sp.accent[0] : sp.accent)}
        />
      </div>
    );
  }

  if (surface === 'voice') {
    return (
      <div
        data-hudson-ref={ref}
        data-hudson-template={initialState.template}
        data-hudson-theme={initialState.theme}
        data-hudson-surface="voice"
        style={{ ...themeStyle, minHeight: '100vh' } as CSSProperties}
      >
        <EmbedHandshake surface={surface} />
        <EmbedVoice />
      </div>
    );
  }

  if (surface === 'docs') {
    return (
      <div
        data-hudson-ref={ref}
        data-hudson-template={initialState.template}
        data-hudson-theme={initialState.theme}
        data-hudson-surface="docs"
        style={{ ...themeStyle, minHeight: '100vh' } as CSSProperties}
      >
        <EmbedHandshake surface={surface} />
        <EmbedDocs />
      </div>
    );
  }

  return (
    <div
      data-hudson-ref={ref}
      data-hudson-template={initialState.template}
      data-hudson-theme={initialState.theme}
      data-hudson-workspace={initialState.activeWorkspaceId}
      data-hudson-focus={initialState.focusedAppId}
      style={{
        ...themeStyle,
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--hud-bg, oklch(0.16 0.005 240))',
        color: 'var(--hud-ink-2, oklch(0.66 0.008 240))',
        fontFamily: 'var(--hud-font-mono, ui-monospace, monospace)',
        fontSize: 12,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      } as CSSProperties}
    >
      <EmbedHandshake surface={surface} />
      <div style={{ textAlign: 'center', display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--hud-accent, oklch(0.72 0.18 162))' }}>
          surface · {surface}
        </div>
        <div style={{ fontSize: 10 }}>app · {appId}</div>
        <div style={{ fontSize: 9, color: 'var(--hud-ink-3, oklch(0.50 0.01 240))' }}>
          real component pending
        </div>
      </div>
    </div>
  );
}
