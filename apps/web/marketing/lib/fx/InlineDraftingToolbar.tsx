'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useFx, type FxState } from './FxContext';
import { useTunable } from '../useTunable';

type ToolToggleKey = 'lens' | 'caliper' | 'cursor' | 'plotter';

type SliderConfig = {
  type: 'slider';
  key: 'lensZoom' | 'plotSpeed';
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};
type ToggleConfig = { type: 'toggle'; key: 'plotRails'; label: string };
type ToolConfig = SliderConfig | ToggleConfig;

type ToolDef = {
  id: ToolToggleKey;
  label: string;
  icon: ReactNode;
  config?: ToolConfig[];
};

const TOOLS: ToolDef[] = [
  {
    id: 'lens',
    label: 'Monocle',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8.2" y1="8.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    config: [
      { type: 'slider', key: 'lensZoom', label: 'Zoom', min: 1.5, max: 4, step: 0.1, format: (v) => `× ${v.toFixed(1)}` },
    ],
  },
  {
    id: 'caliper',
    label: 'Caliper',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <line x1="2.5" y1="1.5" x2="2.5" y2="11.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="10.5" y1="1.5" x2="10.5" y2="11.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="2.5" y1="6.5" x2="10.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="0" y1="1.5" x2="4" y2="1.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="9" y1="1.5" x2="13" y2="1.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: 'cursor',
    label: 'Crosshair',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <line x1="6.5" y1="0" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
        <line x1="0" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6.5" cy="6.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: 'plotter',
    label: 'Plotter',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <rect x="2" y="2" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="5" y="5" width="3" height="3" fill="currentColor" />
        <line x1="0" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="0.9" strokeDasharray="1.2 1.2" />
      </svg>
    ),
    config: [
      { type: 'slider', key: 'plotSpeed', label: 'Speed', min: 0.4, max: 2.4, step: 0.1, format: (v) => `× ${v.toFixed(1)}` },
      { type: 'toggle', key: 'plotRails', label: 'Rails' },
    ],
  },
];

export type InlineDraftingToolbarProps = {
  className?: string;
  style?: CSSProperties;
};

export function InlineDraftingToolbar(props: InlineDraftingToolbarProps) {
  const tunable = useTunable();
  // Dev / ?tune only. Keep an empty slot so the header grid stays balanced.
  if (!tunable) return <span className={props.className} aria-hidden="true" />;
  return <DraftingToolbarPanel {...props} />;
}

function DraftingToolbarPanel({ className, style }: InlineDraftingToolbarProps) {
  const { fx, setFx } = useFx();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activeCount = TOOLS.reduce((n, t) => (fx[t.id] ? n + 1 : n), 0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      data-fx-overlay
      className={['drafting-tools', className].filter(Boolean).join(' ')}
      style={{ position: 'relative', ...style }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={'drafting-tools__trigger' + (open ? ' is-open' : '') + (activeCount > 0 ? ' has-active' : '')}
        aria-expanded={open}
        aria-haspopup="true"
        title="Instruments — drafting overlays"
      >
        <span className="drafting-tools__chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="2" width="10" height="10" stroke="currentColor" strokeWidth="1" />
            <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" />
            <line x1="0" y1="2" x2="2" y2="2" stroke="currentColor" strokeWidth="1" />
            <line x1="2" y1="0" x2="2" y2="2" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
        <span className="drafting-tools__label">Instruments</span>
        {activeCount > 0 && <span className="drafting-tools__count">{activeCount}</span>}
      </button>

      {open && (
        <div className="drafting-tools__panel" role="menu">
          {TOOLS.map((t) => {
            const active = !!fx[t.id];
            return (
              <div key={t.id} className={'drafting-tools__group' + (active ? ' is-active' : '')}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  onClick={() => setFx((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                  className={'drafting-tools__item' + (active ? ' is-active' : '')}
                >
                  <span className="drafting-tools__item-icon">{t.icon}</span>
                  <span className="drafting-tools__item-label">{t.label}</span>
                  <span className="drafting-tools__item-state">{active ? 'ON' : 'OFF'}</span>
                </button>
                {t.config && t.config.length > 0 && (
                  <div className="drafting-tools__config">
                    {t.config.map((c) => (
                      <ConfigRow key={c.key} config={c} fx={fx} setFx={setFx} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigRow({
  config,
  fx,
  setFx,
}: {
  config: ToolConfig;
  fx: FxState;
  setFx: (patch: Partial<FxState> | ((prev: FxState) => FxState)) => void;
}) {
  if (config.type === 'slider') {
    const value = fx[config.key];
    return (
      <div className="drafting-tools__config-row">
        <span className="drafting-tools__config-label">{config.label}</span>
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          onChange={(e) => setFx({ [config.key]: parseFloat(e.target.value) } as Partial<FxState>)}
          className="drafting-tools__config-slider"
        />
        <span className="drafting-tools__config-value">{config.format(value)}</span>
      </div>
    );
  }
  const checked = fx[config.key];
  return (
    <div className="drafting-tools__config-row">
      <span className="drafting-tools__config-label">{config.label}</span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={() => setFx((prev) => ({ ...prev, [config.key]: !prev[config.key] }))}
        className={'drafting-tools__config-toggle' + (checked ? ' is-on' : '')}
        aria-pressed={checked}
      >
        {checked ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
