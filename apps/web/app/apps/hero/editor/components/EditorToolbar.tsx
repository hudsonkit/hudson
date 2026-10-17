import type { EditorTool } from "../types";

interface EditorToolbarProps {
  tool: EditorTool;
  onSetTool: (tool: EditorTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOLS: { key: EditorTool; label: string; shortcut: string; icon: string }[] = [
  { key: "select", label: "Select", shortcut: "V", icon: "↖" },
  { key: "pen", label: "Pen", shortcut: "P", icon: "✒" },
  { key: "hand", label: "Hand", shortcut: "H", icon: "✋" },
];

/**
 * Horizontal toolbar in top-right: tools | undo/redo.
 */
export function EditorToolbar({
  tool,
  onSetTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  return (
    <div className="absolute top-14 right-3 flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 shadow-lg">
      {/* Tool buttons */}
      {TOOLS.map((t) => (
        <button
          key={t.key}
          onClick={() => onSetTool(t.key)}
          title={`${t.label} (${t.shortcut})`}
          className={`
            w-8 h-8 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors
            ${tool === t.key
              ? "bg-foreground/10 text-foreground"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            }
          `}
        >
          {t.icon}
        </button>
      ))}

      <div className="w-px h-5 bg-[var(--color-border)] mx-0.5" />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Cmd+Z)"
        className="w-8 h-8 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Cmd+Shift+Z)"
        className="w-8 h-8 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↪
      </button>
    </div>
  );
}

interface ZoomToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

/**
 * Zoom controls in bottom-right of canvas.
 */
export function ZoomToolbar({ zoom, onZoomIn, onZoomOut, onResetZoom }: ZoomToolbarProps) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 shadow-lg">
      <button
        onClick={onZoomOut}
        title="Zoom out"
        className="w-7 h-7 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        −
      </button>
      <button
        onClick={onResetZoom}
        title="Reset zoom (0)"
        className="w-12 h-7 flex items-center justify-center rounded-md text-[10px] cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] tabular-nums"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        title="Zoom in"
        className="w-7 h-7 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        +
      </button>
    </div>
  );
}
