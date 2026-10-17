/**
 * TalkieInspector — Inspector panel content for Talkie draw mode.
 * Shows the focused glyph's Standard + Specific controls,
 * reading/writing params via TalkieContext.
 */

// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { useTalkieParams } from './TalkieContext';
import type { TalkieParams } from './types';
import { BRAND } from './types';
import type { TalkieDrawState } from '../hero/HeroAppContext';

// ── Editable numeric readout — type-able with clamp + Enter/blur commit ──
function EditableNumber({
  value, min, max, step = 1, unit, disabled, onChange,
}: {
  value: number; min: number; max: number; step?: number;
  unit: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      const snapped = step >= 1 ? Math.round(clamped) : clamped;
      if (snapped !== value) onChange(snapped);
      setDraft(String(snapped));
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  };
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); e.currentTarget.blur(); }
        }}
        className="text-[11px] tabular-nums text-right bg-transparent border-0 outline-none focus:bg-foreground/10 focus:ring-1 focus:ring-amber-600/50 rounded px-1 -mx-1"
        style={{
          color: 'oklch(var(--foreground))', fontFamily: BRAND.mono,
          width: `${Math.max(2, String(max).length + (min < 0 ? 1 : 0))}ch`,
        }}
      />
      <span style={{ color: 'oklch(var(--muted-foreground))' }}>{unit}</span>
    </span>
  );
}

interface TalkieInspectorProps {
  drawState: TalkieDrawState;
}

// ── Slider ──

function Slider({
  label, value, min, max, step = 1, unit = 'u', disabled = false, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1" style={{ opacity: disabled ? 0.35 : 1 }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{label}</span>
        <EditableNumber value={value} min={min} max={max} step={step} unit={unit} disabled={disabled} onChange={onChange} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-amber-600"
        style={{ background: 'oklch(var(--muted))' }} />
    </label>
  );
}

// ── Toggle ──

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-2 py-0.5 cursor-pointer">
      <div className="w-6 h-3.5 rounded-full transition-colors relative" style={{ background: value ? BRAND.cassette : 'oklch(var(--muted))' }}>
        <div className="w-2.5 h-2.5 rounded-full absolute top-0.5 transition-all" style={{ left: value ? 11 : 2, background: 'oklch(var(--foreground))' }} />
      </div>
      <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{label}</span>
    </button>
  );
}

// ── Sub-section ──

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
        <span className="text-[9px]" style={{ color: 'oklch(var(--muted-foreground))' }}>{open ? '▾' : '▸'}</span>
        <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{title}</span>
      </button>
      {open && <div className="pl-2 pt-1.5 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// ── Glyph config ──

const OFFSET_RANGE: [number, number] = [-200, 200];

const GLYPH_MAP: Record<string, {
  advanceKey: keyof TalkieParams; advanceRange: [number, number];
  offsetXKey: keyof TalkieParams;
  heightKey: keyof TalkieParams; heightRange: [number, number]; heightLabel: string;
  stemWidthKey: keyof TalkieParams; stemWidthRange: [number, number];
  cornerKey: keyof TalkieParams; cornerRange: [number, number];
}> = {
  t: { advanceKey: 't_advance', advanceRange: [480, 700], offsetXKey: 't_offsetX', heightKey: 't_height', heightRange: [600, 720], heightLabel: 'Ascender', stemWidthKey: 't_stemWidth', stemWidthRange: [80, 140], cornerKey: 't_cornerSoftness', cornerRange: [0, 30] },
  a: { advanceKey: 'a_advance', advanceRange: [480, 700], offsetXKey: 'a_offsetX', heightKey: 'a_height', heightRange: [450, 600], heightLabel: 'Height', stemWidthKey: 'a_stemWidth', stemWidthRange: [80, 140], cornerKey: 'a_cornerSoftness', cornerRange: [0, 30] },
  l: { advanceKey: 'l_advance', advanceRange: [180, 600], offsetXKey: 'l_offsetX', heightKey: 'l_height', heightRange: [550, 730], heightLabel: 'Ascender', stemWidthKey: 'l_stemWidth', stemWidthRange: [90, 130], cornerKey: 'l_cornerSoftness', cornerRange: [0, 30] },
  k: { advanceKey: 'k_advance', advanceRange: [480, 700], offsetXKey: 'k_offsetX', heightKey: 'k_height', heightRange: [550, 730], heightLabel: 'Ascender', stemWidthKey: 'k_stemWidth', stemWidthRange: [80, 140], cornerKey: 'k_cornerSoftness', cornerRange: [0, 30] },
  i: { advanceKey: 'i_advance', advanceRange: [180, 340], offsetXKey: 'i_offsetX', heightKey: 'i_height', heightRange: [450, 720], heightLabel: 'Height', stemWidthKey: 'i_stemWidth', stemWidthRange: [60, 140], cornerKey: 'i_cornerSoftness', cornerRange: [0, 30] },
  e: { advanceKey: 'e_advance', advanceRange: [480, 700], offsetXKey: 'e_offsetX', heightKey: 'e_height', heightRange: [450, 600], heightLabel: 'Height', stemWidthKey: 'e_stemWidth', stemWidthRange: [80, 140], cornerKey: 'e_cornerSoftness', cornerRange: [0, 30] },
};

export function TalkieInspector({ drawState }: TalkieInspectorProps) {
  const ctx = useTalkieParams();
  if (!ctx) {
    return (
      <div className="p-4 text-[10px]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>
        Studio context not available
      </div>
    );
  }

  const { params, onChange, onResetGlyph } = ctx;
  const { char, hasPathOverride } = drawState;
  const cfg = GLYPH_MAP[char];

  const set = useCallback(
    <K extends keyof TalkieParams>(key: K, value: TalkieParams[K]) => {
      onChange({ ...params, [key]: value, preset: 'custom' });
    },
    [params, onChange],
  );

  if (!cfg) {
    return (
      <div className="p-4 text-[10px]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>
        No config for '{char}'
      </div>
    );
  }

  return (
    <div className="flex flex-col text-[10px]" style={{ background: 'oklch(var(--background))' }}>
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center justify-between"
        style={{ borderBottom: `1px solid oklch(var(--border))` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.2em] font-medium"
            style={{ color: BRAND.cassette, fontFamily: BRAND.mono }}
          >
            Focus · {char}
          </span>
        </div>
        {hasPathOverride && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: BRAND.cassette + '22',
              color: BRAND.cassette,
              fontFamily: BRAND.mono,
            }}
          >
            path edited
          </span>
        )}
      </div>

      {/* Global corner rounding */}
      <div className="px-3 py-3 flex flex-col gap-3" style={{ borderBottom: `1px solid oklch(var(--border))` }}>
        <Slider label="External corners" value={params.cornerSoftnessExternal} min={0} max={60} onChange={(v) => set('cornerSoftnessExternal', v)} />
        <Slider label="Internal corners" value={params.cornerSoftnessInternal} min={0} max={60} onChange={(v) => set('cornerSoftnessInternal', v)} />
      </div>

      {/* Standard controls */}
      <div className="px-3 py-3 flex flex-col gap-3" style={{ borderBottom: `1px solid oklch(var(--border))` }}>
        <Slider label="Width" value={params[cfg.advanceKey] as number} min={cfg.advanceRange[0]} max={cfg.advanceRange[1]} onChange={(v) => set(cfg.advanceKey, v)} />
        <Slider label="Offset X" value={params[cfg.offsetXKey] as number} min={OFFSET_RANGE[0]} max={OFFSET_RANGE[1]} onChange={(v) => set(cfg.offsetXKey, v)} />
        <Slider label={cfg.heightLabel} value={params[cfg.heightKey] as number} min={cfg.heightRange[0]} max={cfg.heightRange[1]} onChange={(v) => set(cfg.heightKey, v)} />
        {(() => {
          const stemActive = char === 'i' || char === 'a' || (char === 'l' && !params.l_foot);
          const cornerActive = true;
          const hint = <span className="text-[9px] mt-0.5 block" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>edit in draw mode</span>;
          return (
            <>
              <div>
                <Slider label="Stem width" value={params[cfg.stemWidthKey] as number} min={cfg.stemWidthRange[0]} max={cfg.stemWidthRange[1]} disabled={!stemActive} onChange={(v) => set(cfg.stemWidthKey, v)} />
                {!stemActive && hint}
              </div>
              <div>
                <Slider label="Corner softness" value={params[cfg.cornerKey] as number} min={cfg.cornerRange[0]} max={cfg.cornerRange[1]} disabled={!cornerActive} onChange={(v) => set(cfg.cornerKey, v)} />
                {!cornerActive && hint}
              </div>
            </>
          );
        })()}
      </div>

      {/* Specifics */}
      {char === 't' && (
        <div className="px-3 py-3 flex flex-col gap-3" style={{ borderBottom: `1px solid oklch(var(--border))` }}>
          <SubSection title="Specifics">
            <Slider label="Crossbar left" value={params.t_crossbarLeft} min={0} max={180} onChange={(v) => set('t_crossbarLeft', v)} />
            <Slider label="Crossbar right" value={params.t_crossbarRight} min={480} max={600} onChange={(v) => set('t_crossbarRight', v)} />
            <Slider label="Crossbar thickness" value={params.t_crossbarThickness} min={70} max={110} onChange={(v) => set('t_crossbarThickness', v)} />
            <Slider label="Hook tightness" value={params.t_hookTightness} min={50} max={110} unit="%" onChange={(v) => set('t_hookTightness', v)} />
          </SubSection>
        </div>
      )}
      {char === 'l' && (
        <div className="px-3 py-3 flex flex-col gap-3" style={{ borderBottom: `1px solid oklch(var(--border))` }}>
          <SubSection title="Specifics">
            <Toggle label="Foot (serifs)" value={params.l_foot} onChange={(v) => set('l_foot', v)} />
          </SubSection>
        </div>
      )}
      {char === 'a' && (
        <div className="px-3 py-3 flex flex-col gap-3" style={{ borderBottom: `1px solid oklch(var(--border))` }}>
          <SubSection title="Specifics">
            <Toggle label="Foot curl" value={params.a_footCurl} onChange={(v) => set('a_footCurl', v)} />
            <Slider label="Curl amount" value={params.a_footCurlAmount} min={0} max={30} disabled={!params.a_footCurl} onChange={(v) => set('a_footCurlAmount', v)} />
          </SubSection>
        </div>
      )}

      {/* Override notice + reset glyph */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid oklch(var(--border))` }}>
        {hasPathOverride && (
          <div className="text-[9px] leading-relaxed mb-2" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>
            Path overrides active. Sliders affect the parametric base; direct edits persist on top.
          </div>
        )}
        <button
          onClick={() => onResetGlyph(char)}
          className="text-[9px] uppercase tracking-[0.16em] py-1 px-2 rounded cursor-pointer transition-colors"
          style={{
            fontFamily: BRAND.mono,
            color: 'oklch(var(--muted-foreground))',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'oklch(var(--foreground))'; e.currentTarget.style.background = 'oklch(var(--muted))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'oklch(var(--muted-foreground))'; e.currentTarget.style.background = 'transparent'; }}
        >
          Reset {char}
        </button>
      </div>
    </div>
  );
}
