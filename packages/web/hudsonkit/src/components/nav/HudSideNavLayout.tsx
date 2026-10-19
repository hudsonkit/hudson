'use client';

import React from 'react';
import { HudTooltip } from '../behaviors/HudTooltip';
import { cx } from '../patterns/utils';
import { useHudSideNav } from './context';
import { HudRailResizeHandle } from './HudRailResizeHandle';
import { HudSideNavToggleCaret } from './primitives';
import { HUD_SIDE_NAV_HEADER_HEIGHT } from './shared';

/** Permanent top row used by the anchored-L shell composition. */
/** Permanent bottom chrome row; matches Hudson's status-bar register. */
export const HUD_SIDE_NAV_BOTTOM_BAR_HEIGHT = 28;
/** Default contextual rail width beside the primary destination rail. */
export const HUD_SIDE_RAIL_EXPANDED_WIDTH = 240;
/** Real compact rail width. Hidden remains a separate zero-width state. */
export const HUD_SIDE_RAIL_COLLAPSED_WIDTH = 48;
/** Header bands use `HUD_SIDE_NAV_HEADER_HEIGHT` across the whole composition. */

type HudChromeLength = number | string;

function cssLength(value: HudChromeLength): string {
  return typeof value === 'number' ? `${value}px` : value;
}

function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

export interface HudSideNavLayoutProps {
  /** Full-height primary navigation. Usually `HudSideNav`. */
  navigation: React.ReactNode;
  /** Optional contextual rail, kept structurally separate from primary navigation. */
  contextRail?: React.ReactNode;
  /** App-wide row anchored beside the primary navigation. */
  topRow?: React.ReactNode;
  /** Permanent bottom chrome spanning navigation, context, and content. */
  bottomBar?: React.ReactNode;
  /** Main application surface. */
  children: React.ReactNode;
  topRowHeight?: HudChromeLength;
  bottomBarHeight?: HudChromeLength;
  contextRailAriaLabel?: string;
  contentAriaLabel?: string;
  /** Add drag, double-click, and keyboard resizing to the primary rail. */
  resizable?: boolean;
  resizeLabel?: string;
  /** Overlay only the chrome while an existing frame continues to own the surface. */
  overlay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Anchored-L application layout: a full-height primary navigation column owns
 * the top corner; one app-wide row begins beside it; a separate contextual rail
 * and the main surface begin below that row. The bottom bar spans every column.
 *
 * Width of the primary column comes from `HudSideNavProvider`. The contextual
 * rail owns its own width, so `HudSideRail` can switch between expanded, compact,
 * and hidden states without coupling its content to the destination tree.
 */
export function HudSideNavLayout({
  navigation,
  contextRail,
  topRow,
  bottomBar,
  children,
  topRowHeight = HUD_SIDE_NAV_HEADER_HEIGHT,
  bottomBarHeight = HUD_SIDE_NAV_BOTTOM_BAR_HEIGHT,
  contextRailAriaLabel = 'Context',
  contentAriaLabel,
  resizable = false,
  resizeLabel = 'Resize primary navigation',
  overlay = false,
  className,
  style,
}: HudSideNavLayoutProps) {
  const {
    width: navigationWidth,
    state,
    side,
    collapsible,
    setOpen,
    expandedWidth,
    defaultExpandedWidth,
    collapsedWidth,
    minExpandedWidth,
    maxExpandedWidth,
    setExpandedWidth,
  } = useHudSideNav();
  const [resizing, setResizing] = React.useState(false);
  const navigationId = React.useId();
  const navigationOnLeft = side === 'left';
  const navigationColumn = navigationOnLeft ? '1' : '3';
  const contentColumn = navigationOnLeft ? '3' : '1';
  const topRowColumns = navigationOnLeft ? '2 / 4' : '1 / 3';

  return (
    <div
      data-hud-side-nav-layout=""
      data-resizing={resizing ? '' : undefined}
      data-state={state}
      data-side={side}
      className={cx(
        'relative isolate grid h-full min-h-0 w-full overflow-hidden',
        'transition-[grid-template-columns] duration-[var(--hud-duration-spring,460ms)] ease-[var(--hud-ease-spring,cubic-bezier(0.32,0.72,0,1))]',
        'motion-reduce:duration-[1ms]',
        resizing && 'transition-none',
        overlay ? 'pointer-events-none fixed inset-0 bg-transparent' : 'bg-background',
        className,
      )}
      style={{
        '--hud-side-nav-header-height': cssLength(topRowHeight),
        gridTemplateColumns: navigationOnLeft
          ? `${navigationWidth}px auto minmax(0, 1fr)`
          : `minmax(0, 1fr) auto ${navigationWidth}px`,
        gridTemplateRows: `var(--hud-side-nav-header-height) minmax(0, 1fr) ${cssLength(bottomBarHeight)}`,
        ...style,
      } as React.CSSProperties}
    >
      <div
        id={navigationId}
        data-hud-side-nav-slot="navigation"
        className={cx(
          'relative row-[1/3] flex min-h-0 flex-col overflow-hidden bg-card/95',
          navigationOnLeft ? 'border-r border-border/70' : 'border-l border-border/70',
          overlay && 'pointer-events-auto',
          '[&>nav]:h-full',
        )}
        style={{ gridColumn: navigationColumn }}
      >
        {navigation}
      </div>

      {resizable && collapsible !== 'none' ? (
        <HudRailResizeHandle
          side={side}
          collapsed={state === 'collapsed'}
          expandedWidth={expandedWidth}
          collapsedWidth={collapsedWidth}
          defaultExpandedWidth={defaultExpandedWidth}
          minExpandedWidth={minExpandedWidth}
          maxExpandedWidth={maxExpandedWidth}
          onCollapsedChange={(collapsed) => setOpen(!collapsed)}
          onExpandedWidthChange={setExpandedWidth}
          controls={navigationId}
          onResizingChange={setResizing}
          label={resizeLabel}
          className="pointer-events-auto absolute z-40 w-2"
          style={{
            top: cssLength(topRowHeight),
            bottom: cssLength(bottomBarHeight),
            ...(navigationOnLeft
              ? { left: navigationWidth - 4 }
              : { right: navigationWidth - 4 }),
          }}
        />
      ) : null}

      {topRow ? (
        <header
          data-hud-side-nav-slot="top-row"
          className={cx(
            'min-w-0 overflow-hidden border-b border-border/70 bg-background/95',
            overlay && 'pointer-events-auto',
          )}
          style={{ gridColumn: topRowColumns, gridRow: '1' }}
        >
          {topRow}
        </header>
      ) : null}

      {contextRail ? (
        <aside
          aria-label={contextRailAriaLabel}
          data-hud-side-nav-slot="context-rail"
          className={cx(
            'min-h-0 overflow-hidden bg-card/95',
            navigationOnLeft ? 'border-r border-border/70' : 'border-l border-border/70',
            overlay && 'pointer-events-auto',
          )}
          style={{ gridColumn: '2', gridRow: '2' }}
        >
          {contextRail}
        </aside>
      ) : null}

      <main
        aria-label={contentAriaLabel}
        data-hud-side-nav-slot="content"
        className={cx('min-h-0 min-w-0 overflow-hidden', overlay && 'pointer-events-none')}
        style={{ gridColumn: contentColumn, gridRow: '2' }}
      >
        {children}
      </main>

      {bottomBar ? (
        <footer
          data-hud-side-nav-slot="bottom-bar"
          className={cx(
            'col-[1/4] row-[3] min-w-0 overflow-hidden border-t border-border/70 bg-background/95',
            overlay && 'pointer-events-auto',
          )}
        >
          {bottomBar}
        </footer>
      ) : null}
    </div>
  );
}

export interface HudSideRailProps {
  /** Accessible rail name and default expanded header label. */
  label: string;
  /** Compact rail state. Hidden is represented by not rendering the rail. */
  collapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Expanded contextual content. Remains mounted while compact. */
  children: React.ReactNode;
  /** Optional compact presentation (avatar stack, glyphs, status dots, …). */
  collapsedContent?: React.ReactNode;
  /** Expanded header content. Defaults to the uppercase `label`. */
  header?: React.ReactNode;
  /** Expanded footer content. Remains mounted while compact. */
  footer?: React.ReactNode;
  /** Initial contextual width while expanded. */
  defaultExpandedWidth?: number;
  /** Controlled contextual width while expanded. */
  expandedWidth?: number;
  onExpandedWidthChange?: (width: number) => void;
  minExpandedWidth?: number;
  maxExpandedWidth?: number;
  collapsedWidth?: number;
  /** Add drag, double-click, and keyboard resizing. */
  resizable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Contextual side rail with a real compact width. Expanded content stays
 * mounted while compact, preventing route lists and live data from cold-mounting
 * when the operator reopens the rail. One stable header control toggles both
 * states; double-clicking empty compact chrome also expands it.
 */
export function HudSideRail({
  label,
  collapsed,
  onCollapsedChange,
  children,
  collapsedContent,
  header,
  footer,
  defaultExpandedWidth = HUD_SIDE_RAIL_EXPANDED_WIDTH,
  expandedWidth,
  onExpandedWidthChange,
  minExpandedWidth = 200,
  maxExpandedWidth = 360,
  collapsedWidth = HUD_SIDE_RAIL_COLLAPSED_WIDTH,
  resizable = false,
  className,
  style,
}: HudSideRailProps) {
  const { side, tooltipDelay } = useHudSideNav();
  const widthControlled = expandedWidth !== undefined;
  const [internalExpandedWidth, setInternalExpandedWidth] = React.useState(
    defaultExpandedWidth,
  );
  const [resizing, setResizing] = React.useState(false);
  const railId = React.useId();
  const resolvedExpandedWidth = clampWidth(
    widthControlled ? expandedWidth : internalExpandedWidth,
    minExpandedWidth,
    maxExpandedWidth,
  );
  const setExpandedWidth = (next: number) => {
    const clamped = clampWidth(next, minExpandedWidth, maxExpandedWidth);
    if (!widthControlled) setInternalExpandedWidth(clamped);
    onExpandedWidthChange?.(clamped);
  };
  const toggleLabel = `${collapsed ? 'Expand' : 'Collapse'} ${label}`;
  const toggle = () => onCollapsedChange?.(!collapsed);

  return (
    <div
      id={railId}
      data-hud-side-rail=""
      data-state={collapsed ? 'collapsed' : 'expanded'}
      data-side={side}
      data-resizing={resizing ? '' : undefined}
      className={cx(
        'relative flex h-full min-h-0 flex-col overflow-hidden',
        'transition-[width] duration-[var(--hud-duration-spring,460ms)] ease-[var(--hud-ease-spring,cubic-bezier(0.32,0.72,0,1))] motion-reduce:duration-[1ms]',
        resizing && 'transition-none',
        className,
      )}
      style={{
        width: collapsed ? collapsedWidth : resolvedExpandedWidth,
        ...style,
      }}
      onDoubleClick={(event) => {
        if (!collapsed || !onCollapsedChange) return;
        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, select, textarea, [role="button"], [role="separator"]')) return;
        onCollapsedChange(false);
      }}
    >
      <div
        className={cx(
          'flex shrink-0 items-center border-b border-border/70 px-2',
          collapsed ? 'justify-center' : 'gap-2',
        )}
        style={{ height: `var(--hud-side-nav-header-height, ${HUD_SIDE_NAV_HEADER_HEIGHT}px)` }}
      >
        {!collapsed ? (
          <div className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {header ?? label}
          </div>
        ) : null}
        {onCollapsedChange ? (
          <HudTooltip
            content={toggleLabel}
            side={side === 'left' ? 'right' : 'left'}
            delay={tooltipDelay}
          >
            <button
              type="button"
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              onClick={toggle}
              className={cx(
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
              )}
            >
              <HudSideNavToggleCaret expanded={!collapsed} side={side} />
            </button>
          </HudTooltip>
        ) : null}

      </div>
      {resizable && onCollapsedChange ? (
        <HudRailResizeHandle
          side={side}
          collapsed={collapsed}
          expandedWidth={resolvedExpandedWidth}
          collapsedWidth={collapsedWidth}
          defaultExpandedWidth={defaultExpandedWidth}
          minExpandedWidth={minExpandedWidth}
          maxExpandedWidth={maxExpandedWidth}
          onCollapsedChange={onCollapsedChange}
          onExpandedWidthChange={setExpandedWidth}
          label={`Resize ${label}`}
          controls={railId}
          onResizingChange={setResizing}
          className={cx(
            'absolute bottom-0 z-30 w-2',
            side === 'left' ? 'right-0' : 'left-0',
          )}
          style={{ top: `var(--hud-side-nav-header-height, ${HUD_SIDE_NAV_HEADER_HEIGHT}px)` }}
        />
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          data-rail-content="expanded"
          aria-hidden={collapsed}
          inert={collapsed}
          className={cx(
            'absolute inset-0 flex min-h-0 flex-col transition-opacity motion-reduce:delay-0 motion-reduce:duration-[1ms]',
            collapsed
              ? 'pointer-events-none opacity-0 duration-[90ms] ease-linear'
              : 'opacity-100 delay-[90ms] duration-[120ms] ease-out',
          )}
          style={{ width: resolvedExpandedWidth }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto frame-scrollbar">{children}</div>
          {footer ? <div className="shrink-0 border-t border-border/70">{footer}</div> : null}
        </div>
        <div
          data-rail-content="collapsed"
          aria-hidden={!collapsed}
          inert={!collapsed}
          className={cx(
            'absolute inset-0 overflow-y-auto frame-scrollbar transition-opacity motion-reduce:delay-0 motion-reduce:duration-[1ms]',
            collapsed
              ? 'opacity-100 delay-[90ms] duration-[120ms] ease-out'
              : 'pointer-events-none opacity-0 duration-[90ms] ease-linear',
          )}
        >
          {collapsedContent}
        </div>
      </div>
    </div>
  );
}
