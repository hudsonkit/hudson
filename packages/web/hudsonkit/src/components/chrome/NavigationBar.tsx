import React from 'react';
import { Search, X } from '../../icons';
import { usePlatform } from '../../platform/PlatformContext';
import { usePlatformLayout } from '../../platform/usePlatformLayout';
import { HudsonKitLockup } from '../brand';

interface NavigationBarProps {
  /** App title/branding */
  title: string;
  /** Subtitle (e.g. filename, project name) */
  subtitle?: React.ReactNode;
  /** Center content slot */
  center?: React.ReactNode;
  /** Right-side actions slot (placed before the search field) */
  actions?: React.ReactNode;
  onTitleClick?: () => void;
  /** Search/filter field */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Position inside an anchored shell row instead of against the viewport. */
  embedded?: boolean;
  /** Render the Hudson mark beside the title. Defaults to true. */
  showMark?: boolean;
}

const NavigationBar: React.FC<NavigationBarProps> = ({
  title,
  subtitle,
  center,
  actions,
  onTitleClick,
  search,
  embedded = false,
  showMark = true,
}) => {
  const { dragRegionProps, onInteractiveMouseDown } = usePlatform();
  const { navTotalHeight } = usePlatformLayout();
  const isFiltered = search && search.value && search.value.length > 0;

  return (
    <div
      data-frame-panel="navigation"
      className={`${embedded ? 'relative h-full w-full' : 'fixed left-0 right-0 top-0'} z-50 pointer-events-auto`}
      {...dragRegionProps}
    >
      <div
        className={`flex items-end bg-background/95 px-4 ${
          embedded ? '' : 'border-b shadow-[var(--hud-shadow-nav)]'
        }`}
        style={{
          height: embedded ? '100%' : navTotalHeight,
          borderColor: embedded
            ? undefined
            : 'var(--hud-chrome-border, oklch(var(--border) / 0.8))',
        }}
      >
        {/* Left: Branding */}
        <div className="absolute left-4 bottom-0 h-12 z-10 flex items-center gap-3 select-none min-w-0" style={{ maxWidth: 'calc(100% - 9rem)' }} onMouseDown={onInteractiveMouseDown}>
          <button
            onClick={onTitleClick}
            aria-label={title}
            className="group flex items-center gap-[7px] text-foreground/85 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-0.5 -mx-0.5 leading-none"
          >
            {showMark ? (
              <HudsonKitLockup markSize={15} wordmark={title} gap={7} />
            ) : (
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
                {title}
              </span>
            )}
          </button>
          {subtitle && (
            <span className="flex min-w-0 text-xs font-mono font-light text-muted-foreground">{subtitle}</span>
          )}
        </div>

        {/* Center */}
        {center && (
          <div className="flex-1 flex justify-center h-12 items-center" onMouseDown={onInteractiveMouseDown}>
            {center}
          </div>
        )}

        {/* Right: Actions + Search */}
        <div className="absolute right-4 bottom-0 h-12 z-10 flex items-center gap-3" onMouseDown={onInteractiveMouseDown}>
          {actions}

          {/* Search / Scope filter */}
          {search && (
            <div className="hidden sm:block relative w-[220px] max-w-[34vw] bg-card border border-input rounded px-2.5 shadow-[inset_0_1px_0_oklch(var(--foreground)/0.02)] hover:border-ring/60 focus-within:border-ring focus-within:bg-card transition-colors duration-200">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Search'}
                className={`
                  w-full h-7 pl-5 pr-6 bg-transparent text-[11px] font-mono font-normal tracking-[0.02em]
                  placeholder:text-muted-foreground/80 placeholder:font-light text-foreground
                  focus:outline-none transition-all duration-200
                  ${isFiltered ? 'text-accent' : ''}
                `}
              />
              {isFiltered && (
                <button
                  onClick={() => search.onChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;
