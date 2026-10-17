import type { HeroGlyph, FontMetrics } from "../types";
import { GlyphEditorProvider, useGlyphEditor } from "./GlyphEditorProvider";
import { EditorCanvas } from "./components/EditorCanvas";
import { EditorToolbar, ZoomToolbar } from "./components/EditorToolbar";

interface GlyphEditorViewProps {
  glyph: HeroGlyph;
  metrics: FontMetrics;
  onExit: () => void;
}

/**
 * Glyph editor layout: top bar + canvas + floating toolbars.
 * Sidebars are handled by Hudson's left panel and inspector.
 */
export function GlyphEditorView({ glyph, metrics, onExit }: GlyphEditorViewProps) {
  return (
    <GlyphEditorProvider glyph={glyph} metrics={metrics} onExit={onExit}>
      <EditorLayout />
    </GlyphEditorProvider>
  );
}

function EditorLayout() {
  const editor = useGlyphEditor();

  return (
    <div className="flex h-full">
      {/* Main canvas area — full width */}
      <div className="flex-1 relative flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={editor.exitEditor}
              className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
            >
              <span>←</span>
              <span>Glyphs</span>
            </button>
            <div className="w-px h-4 bg-[var(--color-border)]" />
            <span className="text-sm font-medium">
              {editor.glyph.character ?? editor.glyph.name ?? `#${editor.glyph.index}`}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {editor.glyph.unicode != null
                ? `U+${editor.glyph.unicode.toString(16).toUpperCase().padStart(4, "0")}`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>Esc to exit</span>
            <span>Space+drag to pan</span>
            <span>Scroll to zoom</span>
          </div>
        </div>

        {/* Canvas */}
        <EditorCanvas
          contours={editor.contours}
          metrics={editor.metrics}
          advanceWidth={editor.glyph.advanceWidth}
          selectedPoint={editor.selectedPoint}
          smoothStates={editor.smoothStates}
          tool={editor.tool}
          pan={editor.pan}
          zoom={editor.zoom}
          isPanning={editor.isPanning}
          display={editor.display}
          mousePos={editor.mousePos}
          containerRef={editor.containerRef}
          onWheel={editor.handleWheel}
          onMouseDown={editor.handleMouseDown}
          onMouseMove={editor.handleMouseMove}
          onMouseUp={editor.handleMouseUp}
          onCanvasClick={editor.handleCanvasClick}
        />

        {/* Tools + undo/redo — top right */}
        <EditorToolbar
          tool={editor.tool}
          onSetTool={editor.setTool}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.handleUndo}
          onRedo={editor.handleRedo}
        />

        {/* Zoom controls — bottom right */}
        <ZoomToolbar
          zoom={editor.zoom}
          onZoomIn={editor.zoomIn}
          onZoomOut={editor.zoomOut}
          onResetZoom={editor.resetZoom}
        />
      </div>
    </div>
  );
}
