'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'hudsonkit/icons';
import { encodeThemeForEmbed } from './embed-theme';
import { useStudio } from '@/marketing/theme/StudioContext';

export type EmbedSizing =
  | { mode: 'fixed'; width: number; height: number }
  | { mode: 'responsive'; aspectRatio?: string; minHeight?: number }
  | { mode: 'fill' };

export type EmbedDensity = 'compact' | 'cozy' | 'comfy';

export interface EmbedContext {
  palette: Record<string, string>;
  fonts: Record<string, string>;
  layout: {
    width: number;
    height: number;
    density?: EmbedDensity;
    sizing: EmbedSizing;
    expects?: {
      manifestPanel?: boolean;
      heroPinned?: boolean;
      inspector?: boolean;
      buildStrip?: boolean;
      legend?: boolean;
    };
  };
  surface: string;
  context: {
    workspace?: string;
    instance?: string;
    template?: string;
    ref?: string;
    locale?: string;
  };
}

export type HudsonEmbedProps = {
  src: string;
  surface: string;
  sizing?: EmbedSizing;
  density?: EmbedDensity;
  workspace?: string;
  instance?: string;
  template?: string;
  refHandle?: string;
  consumerId?: string;
  expects?: EmbedContext['layout']['expects'];
  className?: string;
  style?: CSSProperties;
  title?: string;
  popout?: boolean;
  themeMap?: Record<string, string>;
  themeFrom?: string;
  // Iframe loading priority. The hero embed sets 'eager'; everything below
  // the fold defaults to 'lazy' so the browser defers fetch + paint until the
  // user scrolls near them. Sequential below-fold loading is what the
  // browser does anyway under bandwidth contention; 'lazy' just makes it
  // explicit and frees the hero to use the connection.
  priority?: 'eager' | 'lazy';
  /** Panels to start closed. `'right:narrow'` keeps it closed only on narrow frames. */
  collapse?: Array<'left' | 'right' | 'left:narrow' | 'right:narrow'>;
  /** Other workspace ids to offer in the embed's switcher. */
  workspaces?: string[];
  /** Named accent preset for the embedded shell (e.g. 'ember'). */
  accent?: 'ember' | 'harbor';
  /** Apps to open on first load (defaults to the workspace's own set). */
  apps?: string[];
  /** Force the embedded shell's color scheme (otherwise the consumer's, or system). */
  theme?: 'dark' | 'light';
};

const DEFAULT_THEME_MAP: Record<string, string> = {
  '--paper': '--hud-bg',
  '--paper-2': '--hud-bg-2',
  '--paper-3': '--hud-bg-3',
  '--ink': '--hud-ink',
  '--ink-1': '--hud-ink-1',
  '--ink-2': '--hud-ink-2',
  '--ink-3': '--hud-ink-3',
  '--line': '--hud-line',
  '--line-strong': '--hud-line-strong',
  '--accent': '--hud-accent',
  '--accent-soft': '--hud-accent-soft',
  '--accent-line': '--hud-accent-line',
  '--stroke-w': '--hud-border-width',
};

const DEFAULT_FONT_MAP: Record<string, string> = {
  '--font-display': '--hud-font-display',
  '--font-body': '--hud-font-body',
  '--font-mono': '--hud-font-mono',
};

const DEFAULT_APP_EMBED_ORIGIN = 'https://app.hudsonkit.com';
const DEV_APP_EMBED_ORIGIN = process.env.NEXT_PUBLIC_HUDSON_APP_ORIGIN ?? '';
const NODE_ENV = process.env.NODE_ENV;

function currentOrigin(): string {
  if (typeof window === 'undefined') return DEFAULT_APP_EMBED_ORIGIN;
  return window.location.origin;
}

function appEmbedOrigin(): string {
  const configured = DEV_APP_EMBED_ORIGIN.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (NODE_ENV !== 'production') return '';
  return DEFAULT_APP_EMBED_ORIGIN;
}

function resolveEmbedUrl(src: string): { url: URL; absolute: boolean } | null {
  try {
    const isAbsolute = /^https?:\/\//i.test(src);
    const isEmbedPath = src.startsWith('/embed');
    const embedOrigin = isEmbedPath ? appEmbedOrigin() : '';
    const base = !isAbsolute && isEmbedPath && embedOrigin ? embedOrigin : currentOrigin();
    const url = new URL(src, base);
    return { url, absolute: isAbsolute || Boolean(embedOrigin) };
  } catch {
    return null;
  }
}

function readVars(el: Element, map: Record<string, string>): Record<string, string> {
  const computed = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const [src, dest] of Object.entries(map)) {
    const v = computed.getPropertyValue(src).trim();
    if (v) out[dest] = v;
  }
  return out;
}

export function HudsonEmbed({
  src,
  surface,
  sizing = { mode: 'fill' },
  density = 'comfy',
  workspace = 'self',
  instance,
  template,
  refHandle,
  consumerId,
  expects,
  className,
  style,
  title,
  popout = true,
  themeMap = DEFAULT_THEME_MAP,
  themeFrom,
  priority = 'lazy',
  collapse,
  workspaces,
  accent,
  apps,
  theme,
}: HudsonEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reportedHeight, setReportedHeight] = useState<number | null>(null);
  const { state: studioState } = useStudio();
  const resolvedEmbed = resolveEmbedUrl(src);

  const targetOrigin = (() => {
    return resolvedEmbed?.url.origin ?? '*';
  })();

  const encodedPalette = encodeThemeForEmbed(studioState);

  const iframeSrc = (() => {
    if (!resolvedEmbed) return src;
    const { url, absolute } = resolvedEmbed;
    if (consumerId) url.searchParams.set('ref', consumerId);
    url.searchParams.set('mode', sizing.mode);
    if (sizing.mode === 'fixed') {
      url.searchParams.set('sizex', String(sizing.width));
      url.searchParams.set('sizey', String(sizing.height));
    }
    if (density) url.searchParams.set('density', density);
    url.searchParams.set('surface', surface);
    if (template) url.searchParams.set('template', template);
    // When a consumerId is provided, defer theme to the registry entry
    // (light/dark drives `data-hudson-theme` and the tokens.css cascade).
    // Without a consumerId, fall back to dark — Hudson's native default.
    if (theme) url.searchParams.set('theme', theme);
    else if (!consumerId) url.searchParams.set('theme', 'dark');
    url.searchParams.set('palette', encodedPalette);
    if (collapse?.length) url.searchParams.set('collapse', collapse.join(','));
    if (workspaces?.length) url.searchParams.set('workspaces', workspaces.join(','));
    if (accent) url.searchParams.set('accent', accent);
    if (apps?.length) url.searchParams.set('apps', apps.join(','));
    return absolute ? url.toString() : url.pathname + url.search;
  })();

  const buildPalette = useCallback(() => {
    const sourceEl =
      (themeFrom && document.querySelector(themeFrom)) ||
      document.querySelector('.hudson-site') ||
      document.documentElement;
    return readVars(sourceEl as Element, themeMap);
  }, [themeFrom, themeMap]);

  const buildFonts = useCallback(() => {
    const sourceEl =
      (themeFrom && document.querySelector(themeFrom)) ||
      document.querySelector('.hudson-site') ||
      document.documentElement;
    return readVars(sourceEl as Element, DEFAULT_FONT_MAP);
  }, [themeFrom]);

  const sendEmbedContext = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const rect = iframe.getBoundingClientRect();
    const ctx: EmbedContext = {
      palette: buildPalette(),
      fonts: buildFonts(),
      layout: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        density,
        sizing,
        expects,
      },
      surface,
      context: {
        workspace,
        instance,
        template,
        ref: refHandle,
      },
    };

    iframe.contentWindow.postMessage({ type: 'hudson:embed-context', context: ctx }, targetOrigin);
  }, [
    buildFonts,
    buildPalette,
    density,
    expects,
    instance,
    refHandle,
    sizing,
    surface,
    targetOrigin,
    template,
    workspace,
  ]);

  const sendThemeSync = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const vars = { ...buildPalette(), ...buildFonts() };
    iframe.contentWindow.postMessage({ type: 'hudson:theme-sync', vars }, targetOrigin);
  }, [buildFonts, buildPalette, targetOrigin]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'hudson:embed-ready') {
        sendEmbedContext();
      } else if (data.type === 'hudson:embed-resize' && sizing.mode === 'responsive') {
        if (typeof data.height === 'number') setReportedHeight(data.height);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendEmbedContext, sizing.mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => sendThemeSync();
    window.addEventListener('hudson:theme-change', handler);
    return () => window.removeEventListener('hudson:theme-change', handler);
  }, [sendThemeSync]);

  const sizeStyle: CSSProperties = (() => {
    if (sizing.mode === 'fixed') return { width: sizing.width, height: sizing.height };
    if (sizing.mode === 'responsive')
      return {
        width: '100%',
        height: reportedHeight ?? sizing.minHeight ?? 240,
        aspectRatio: !reportedHeight ? sizing.aspectRatio : undefined,
      };
    return { width: '100%', height: '100%' };
  })();

  return (
    <>
      {popout ? (
        <a
          className="hudson-embed-popout"
          href={iframeSrc}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${surface} embed in a full view`}
          title="Open full view"
        >
          <span>Open full</span>
          <ExternalLink size={12} strokeWidth={1.8} />
        </a>
      ) : null}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={title ?? `hudson embed · ${surface}`}
        data-hudson-embed-surface={surface}
        className={className}
        loading={priority === 'eager' ? 'eager' : 'lazy'}
        // @ts-expect-error fetchPriority is valid HTML; React 19 typings lag
        fetchPriority={priority === 'eager' ? 'high' : 'low'}
        // Workspace embeds may render Voice/AI/canvas content with audio replies
        // and presenter-mode flips. autoplay/fullscreen/encrypted-media unblock
        // those flows in the iframe without forcing a user gesture per surface.
        allow="microphone; clipboard-write; autoplay; fullscreen; encrypted-media"
        style={{ display: 'block', border: 0, ...sizeStyle, ...style }}
      />
    </>
  );
}
