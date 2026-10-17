export interface DisplayOptions {
  showPoints: boolean;
  showHandles: boolean;
  showLabels: boolean;
  showGuides: boolean;
  showFill: boolean;
  showTangents: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  showPoints: true,
  showHandles: true,
  showLabels: false,
  showGuides: true,
  showFill: true,
  showTangents: false,
};

interface DisplaySidebarProps {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}

const TOGGLES: { key: keyof DisplayOptions; label: string; icon: string }[] = [
  { key: "showPoints", label: "Points", icon: "●" },
  { key: "showHandles", label: "Handles", icon: "◇" },
  { key: "showTangents", label: "Tangents", icon: "∠" },
  { key: "showLabels", label: "Labels", icon: "Aa" },
  { key: "showGuides", label: "Guides", icon: "┄" },
  { key: "showFill", label: "Fill", icon: "▮" },
];

/**
 * Left sidebar: display toggles for controlling what's visible on the canvas.
 */
export function DisplaySidebar({ display, onChange }: DisplaySidebarProps) {
  const toggle = (key: keyof DisplayOptions) => {
    onChange({ ...display, [key]: !display[key] });
  };

  return (
    <div className="w-44 border-r border-[var(--color-border)] bg-[var(--color-surface)] py-3 px-2 shrink-0 flex flex-col gap-0.5">
      <h3 className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider px-2 mb-1.5">
        Display
      </h3>

      {TOGGLES.map((t) => (
        <button
          key={t.key}
          onClick={() => toggle(t.key)}
          className={`
            flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors w-full text-left
            ${display[t.key]
              ? "text-[var(--color-text)] bg-[var(--color-surface-hover)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            }
          `}
        >
          <span className="w-5 text-center text-sm opacity-70">{t.icon}</span>
          <span>{t.label}</span>
          <span className="ml-auto">
            {display[t.key] ? (
              <span className="text-[var(--color-accent)]">●</span>
            ) : (
              <span className="opacity-30">○</span>
            )}
          </span>
        </button>
      ))}

      {/* Legend */}
      <div className="mt-auto pt-3 px-2 space-y-1.5">
        <h3 className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
          Legend
        </h3>
        <LegendItem color="#ef4444" label="Corner" />
        <LegendItem color="#22c55e" label="Smooth" />
        <LegendItem color="#3b82f6" label="Control" />
        <LegendItem color="#eab308" label="Selected" />
        <LegendItem color="var(--color-baseline)" label="Baseline" />
        <LegendItem color="var(--color-ascender)" label="Ascender" />
        <LegendItem color="var(--color-descender)" label="Descender" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}
