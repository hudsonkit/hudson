import React from 'react';
import { PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen } from '../../icons';
import { usePlatformLayout } from '../../platform/usePlatformLayout';

interface SidePanelProps {
  side: 'left' | 'right';
  title?: string;
  /** Icon rendered before the title */
  icon?: React.ReactNode;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Additional header actions (right of title) */
  headerActions?: React.ReactNode;
  /** Footer content pinned to bottom (outside scroll area) */
  footer?: React.ReactNode;
  /** Additional inline styles (for dynamic positioning) */
  style?: React.CSSProperties;
  /** Width of the panel */
  width?: number;
  /** Resize start handler */
  onResizeStart?: (e: React.MouseEvent) => void;
  /**
   * Render as a floating overlay above the content area: elevated surface
   * (backdrop blur + stronger shadow, themeable via --hud-shadow-panel-float)
   * and a `data-floating="true"` attribute. Positioning is unchanged — the
   * shell decides whether content insets around the panel or flows beneath
   * it. Defaults to false (identical rendering to before this prop existed).
   */
  floating?: boolean;
  children: React.ReactNode;
}

const SidePanel: React.FC<SidePanelProps> = ({
  side, title, icon, isCollapsed = false, onToggleCollapse, headerActions, footer, style, width, onResizeStart, floating = false, children
}) => {
  const chromeBorder = 'var(--hud-chrome-border, oklch(var(--border) / 0.8))';
  // Called before the collapsed early-return so hook order stays stable across renders.
  const { panelTopOffset } = usePlatformLayout();

  // Show expand button when collapsed
  if (isCollapsed) {
    const ExpandIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;
    return (
      <button
        onClick={onToggleCollapse}
        className={`fixed top-1/2 -translate-y-1/2 z-40 ${
          side === 'left' ? 'left-3' : 'right-3'
        } p-2.5 rounded bg-card/95 border hover:border-accent/60 shadow-[var(--hud-shadow-panel)] hover:shadow-[var(--hud-shadow-panel-hover,var(--hud-shadow-panel))] transition-all duration-200 group pointer-events-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none`}
        style={{ borderColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' }}
        title={`Expand ${title || 'panel'}`}
      >
        <ExpandIcon size={14} className="text-muted-foreground group-hover:text-accent transition-colors" strokeWidth={1.5} />
      </button>
    );
  }

  const CollapseIcon = side === 'left' ? PanelLeftClose : PanelRightClose;

  // Build className manually to avoid any conflicts
  // Remove outer-edge + inner-edge borders; resize handle provides the inner-edge separator
  const baseClasses = 'bg-card/95 border shadow-[var(--hud-shadow-panel)] fixed z-40 rounded-none border-t-0 overflow-hidden';
  const sideSpecificClasses = side === 'left' ? 'border-l-0 border-r-0' : 'border-r-0 border-l-0';
  const panelClass = `${baseClasses} ${sideSpecificClasses}`;

  // Caller-provided style.top/bottom (e.g. AppShell passing chrome-aware insets)
  // wins over the internal defaults; the platform offsets remain the fallback
  // for direct consumers of SidePanel that don't supply positioning.
  // Floating overlay elevation — content flows beneath the panel, so it needs
  // to read as a layer above it: chrome-border ring + deep directional shadow
  // (themeable via --hud-shadow-panel-float) and a backdrop blur.
  const floatingStyle: React.CSSProperties = floating
    ? {
        boxShadow: `var(--hud-shadow-panel-float, 0 0 0 1px ${chromeBorder}, ${
          side === 'left' ? '18px' : '-18px'
        } 0 48px -12px rgba(0, 0, 0, 0.55))`,
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      }
    : {};

  const finalStyle: React.CSSProperties = {
    position: 'fixed',
    top: panelTopOffset,
    bottom: 28,
    left: side === 'left' ? 0 : undefined,
    right: side === 'right' ? 0 : undefined,
    width: `${width || 280}px`,
    borderColor: chromeBorder,
    ...floatingStyle,
    ...style,
  };

  return (
    <div
      data-frame-panel={side === 'left' ? 'manifest' : 'inspector'}
      data-floating={floating ? 'true' : undefined}
      className={`${panelClass} pointer-events-none select-none font-mono text-[11px] flex flex-col`}
      style={finalStyle}
    >
      {/* Resize handle — sits flush at inner edge, line on the outermost side */}
      {onResizeStart && (
        <div
          className={`absolute top-0 ${side === 'left' ? 'right-0' : 'left-0'} bottom-0 w-[7px] cursor-ew-resize z-50 pointer-events-auto group flex items-center justify-center`}
          onMouseDown={onResizeStart}
        >
          {/* Border line flush at panel edge */}
          <div
            className={`absolute top-0 bottom-0 ${side === 'left' ? 'right-0' : 'left-0'} w-px transition-colors group-hover:bg-accent/30`}
            style={{ backgroundColor: chromeBorder }}
          />
          {/* Grip dots */}
          <div className="flex flex-col gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/70 group-hover:bg-accent/70" />
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/70 group-hover:bg-accent/70" />
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/70 group-hover:bg-accent/70" />
          </div>
        </div>
      )}
      {/* Static border line when no resize handle */}
      {!onResizeStart && (
        <div
          className={`absolute top-0 ${side === 'left' ? 'right-0' : 'left-0'} bottom-0 w-px`}
          style={{ backgroundColor: chromeBorder }}
        />
      )}
      {/* Top highlight */}

      <div className="pointer-events-auto flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {title && (
          <div
            className="shrink-0 p-4"
            style={{ borderBottom: `1px dashed ${chromeBorder}` }}
          >
            <div className="flex items-center justify-between text-foreground text-[10px]">
              <div className="flex items-center gap-1.5">
                {icon && <span className="text-muted-foreground">{icon}</span>}
                <span className="tracking-[0.18em] font-normal uppercase text-muted-foreground">{title}</span>
              </div>
              <div className="flex items-center gap-2">
                {headerActions}
                {onToggleCollapse && (
                  <button
                    onClick={onToggleCollapse}
                    className="p-1 hover:bg-accent/10 rounded transition-colors text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    title="Collapse panel"
                  >
                    <CollapseIcon size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto frame-scrollbar">
          {children}
        </div>

        {/* Footer — pinned to bottom */}
        {footer && (
          <div className="shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
