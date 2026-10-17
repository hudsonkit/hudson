import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HeroGlyph, FontMetrics } from "../types";
import type { EditableContour, SelectedPoint, EditorTool, Point } from "./types";
import { pathToContours, contoursToPath } from "../lib/path-convert";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useEditorHistory } from "./hooks/useEditorHistory";
import { usePointEditing } from "./hooks/usePointEditing";
import { usePenTool } from "./hooks/usePenTool";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSession } from "../session/SessionProvider";
import { useHeroApp } from "../hero/HeroAppContext";
import { type DisplayOptions, DEFAULT_DISPLAY } from "./components/DisplaySidebar";

interface GlyphEditorContextValue {
  glyph: HeroGlyph;
  metrics: FontMetrics;
  contours: EditableContour[];
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  selectedPoint: SelectedPoint | null;
  smoothStates: Record<string, boolean>;
  // Display options
  display: DisplayOptions;
  setDisplay: (d: DisplayOptions) => void;
  // Canvas interaction
  pan: Point;
  zoom: number;
  isPanning: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleCanvasClick: (e: React.MouseEvent) => void;
  // Mouse position in font-space
  mousePos: Point | null;
  // Zoom
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  // History
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  // Exit
  exitEditor: () => void;
}

const GlyphEditorContext = createContext<GlyphEditorContextValue | null>(null);

export function useGlyphEditor() {
  const ctx = useContext(GlyphEditorContext);
  if (!ctx) throw new Error("useGlyphEditor must be used within GlyphEditorProvider");
  return ctx;
}

interface GlyphEditorProviderProps {
  glyph: HeroGlyph;
  metrics: FontMetrics;
  onExit: () => void;
  children: React.ReactNode;
}

export function GlyphEditorProvider({
  glyph,
  metrics,
  onExit,
  children,
}: GlyphEditorProviderProps) {
  const { updateGlyphPath, initGlyphEdit, updateGlyphEditState } = useSession();
  const [tool, setTool] = useState<EditorTool>("select");
  const [contours, setContours] = useState<EditableContour[]>([]);
  const [smoothStates, setSmoothStates] = useState<Record<string, boolean>>({});
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const initializedRef = useRef(false);

  // Initialize contours from glyph path
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const editState = initGlyphEdit(glyph.index);
    setSmoothStates(editState.smoothStates);
    setContours(pathToContours(glyph.path));
  }, [glyph, initGlyphEdit]);

  // Hooks
  // The inner translate in EditorCanvas: translate(advanceWidth * -0.3, -centerY)
  const advanceWidth = glyph.advanceWidth || metrics.unitsPerEm;
  const emHeight = metrics.ascender - metrics.descender;
  const centerY = metrics.descender + emHeight / 2;
  const glyphOffset: Point = [advanceWidth * -0.3, -centerY];

  const activeTool = spaceHeld ? "hand" : tool;
  const canvas = useCanvasInteraction(activeTool === "hand", glyphOffset);
  const history = useEditorHistory();
  const points = usePointEditing();
  const pen = usePenTool();

  // Initialize history when contours first load
  const historyInitRef = useRef(false);
  useEffect(() => {
    if (contours.length > 0 && !historyInitRef.current) {
      historyInitRef.current = true;
      history.reset(contours);
    }
  }, [contours, history]);

  // Auto-fit when contours first become available
  const autoFitRef = useRef(false);
  useEffect(() => {
    if (autoFitRef.current || contours.length === 0) return;
    const el = canvas.containerRef.current;
    if (!el) return;
    autoFitRef.current = true;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const height = metrics.ascender - metrics.descender;
    const width = glyph.advanceWidth || metrics.unitsPerEm;

    const scaleX = rect.width / (width * 1.4);
    const scaleY = rect.height / (height * 1.2);
    const fitZoom = Math.min(scaleX, scaleY, 2);

    canvas.setZoom(fitZoom);
    canvas.setPan([rect.width / 2, rect.height / 2]);
  }, [contours, canvas, metrics, glyph]);

  // Zoom helpers
  const zoomIn = useCallback(() => {
    canvas.setZoom((z: number) => Math.min(50, z * 1.25));
  }, [canvas]);

  const zoomOut = useCallback(() => {
    canvas.setZoom((z: number) => Math.max(0.1, z / 1.25));
  }, [canvas]);

  const resetZoom = useCallback(() => {
    const el = canvas.containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const h = metrics.ascender - metrics.descender;
    const w = glyph.advanceWidth || metrics.unitsPerEm;
    const scaleX = rect.width / (w * 1.4);
    const scaleY = rect.height / (h * 1.2);
    const fitZoom = Math.min(scaleX, scaleY, 2);
    canvas.setZoom(fitZoom);
    canvas.setPan([rect.width / 2, rect.height / 2]);
  }, [canvas, metrics, glyph]);

  // Update contours helper
  const updateContours = useCallback(
    (newContours: EditableContour[]) => {
      setContours(newContours);
      history.pushSnapshot(newContours);
      // Sync back to session
      const path = contoursToPath(newContours);
      updateGlyphPath(glyph.index, path);
      updateGlyphEditState(glyph.index, {
        dirty: true,
        originalPath: [], // preserved from init
        sourceFormat: "cubic",
        smoothStates,
        undoStack: [],
        undoIndex: 0,
      });
    },
    [glyph.index, history, smoothStates, updateGlyphPath, updateGlyphEditState],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    const prev = history.undo();
    if (prev) {
      setContours(prev);
      updateGlyphPath(glyph.index, contoursToPath(prev));
    }
  }, [history, glyph.index, updateGlyphPath]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (next) {
      setContours(next);
      updateGlyphPath(glyph.index, contoursToPath(next));
    }
  }, [history, glyph.index, updateGlyphPath]);

  // Track whether mouseDown started a select-tool action (to suppress click)
  const didMouseDownSelectRef = useRef(false);

  // Mouse down — select tool: select/deselect + start drag; hand tool: pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      didMouseDownSelectRef.current = false;

      if (activeTool === "hand" || e.button === 1) {
        canvas.handleMouseDown(e);
        return;
      }

      if (activeTool === "select" && e.button === 0) {
        const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY);

        // Alt+click: toggle smooth/corner
        if (e.altKey && points.selectedPoint) {
          const result = points.toggleSmooth(contours);
          if (result) {
            updateContours(result.contours);
            const key = `${points.selectedPoint.contourIndex}-${points.selectedPoint.segmentIndex}-${points.selectedPoint.pointType}`;
            setSmoothStates((prev) => ({ ...prev, [key]: result.isSmooth }));
          }
          didMouseDownSelectRef.current = true;
          return;
        }

        // Hit test: select + start drag, or deselect on miss
        const hit = points.hitTest(canvasPos, contours, canvas.zoom);
        if (hit) {
          points.startDrag(hit);
        } else {
          points.setSelectedPoint(null);
        }
        didMouseDownSelectRef.current = true;
        e.preventDefault();
      }
    },
    [activeTool, canvas, contours, points, updateContours],
  );

  // Mouse move — drag, pan, and track position
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Always track mouse position in font-space
      const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY);
      setMousePos(canvasPos);

      if (canvas.isPanning) {
        canvas.handleMouseMove(e);
        return;
      }

      if (activeTool === "select" && points.isDragging) {
        const result = points.drag(canvasPos, contours, e.shiftKey);
        if (result) {
          setContours(result);
        }
      } else if (activeTool === "pen") {
        pen.updatePreview(canvasPos);
      }
    },
    [activeTool, canvas, contours, points, pen],
  );

  // Mouse up — end drag, commit to history
  const handleMouseUp = useCallback(() => {
    canvas.handleMouseUp();
    if (points.isDragging) {
      points.endDrag();
      history.pushSnapshot(contours);
      updateGlyphPath(glyph.index, contoursToPath(contours));
    }
  }, [canvas, points, history, contours, glyph.index, updateGlyphPath]);

  // Click — only used for pen tool (select handled entirely in mouseDown)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Skip if select tool already handled this in mouseDown
      if (didMouseDownSelectRef.current) return;
      if (canvas.isPanning) return;

      if (activeTool === "pen") {
        const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY);
        const result = pen.addPoint(canvasPos, contours);
        updateContours(result);
      }
    },
    [activeTool, canvas, contours, pen, updateContours],
  );

  // Exit editor
  const exitEditor = useCallback(() => {
    // Finish pen if active
    if (pen.isDrawing) {
      pen.finishContour(contours);
    }
    onExit();
  }, [pen, contours, onExit]);

  // Keyboard shortcuts
  const shortcutActions = useMemo(
    () => ({
      setTool,
      undo: handleUndo,
      redo: handleRedo,
      save: () => {
        // Force save (already auto-saving)
        updateGlyphPath(glyph.index, contoursToPath(contours));
      },
      deletePoint: () => {
        const result = points.deletePoint(contours);
        if (result) updateContours(result);
      },
      nudge: (dx: number, dy: number) => {
        const result = points.nudge(dx, dy, contours);
        if (result) updateContours(result);
      },
      deselect: () => {
        if (points.selectedPoint) {
          points.setSelectedPoint(null);
        } else if (pen.isDrawing) {
          setContours(pen.finishContour(contours));
        } else {
          exitEditor();
        }
      },
      exitEditor,
      resetZoom: canvas.resetView,
      setSpaceHeld,
    }),
    [
      setTool,
      handleUndo,
      handleRedo,
      glyph.index,
      contours,
      points,
      pen,
      canvas.resetView,
      updateContours,
      exitEditor,
      updateGlyphPath,
    ],
  );

  useKeyboardShortcuts(shortcutActions);

  // Sync editor state up to HeroAppContext for Hudson panels
  const { setEditorState, clearEditorState } = useHeroApp();
  useEffect(() => {
    setEditorState({
      contours,
      selectedPoint: points.selectedPoint,
      smoothStates,
      display,
      setDisplay,
    });
  }, [contours, points.selectedPoint, smoothStates, display, setEditorState]);

  useEffect(() => {
    return () => clearEditorState();
  }, [clearEditorState]);

  const value = useMemo<GlyphEditorContextValue>(
    () => ({
      glyph,
      metrics,
      contours,
      tool: activeTool,
      setTool,
      selectedPoint: points.selectedPoint,
      smoothStates,
      display,
      setDisplay,
      pan: canvas.pan,
      zoom: canvas.zoom,
      isPanning: canvas.isPanning,
      containerRef: canvas.containerRef,
      handleWheel: canvas.handleWheel,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleCanvasClick,
      mousePos,
      zoomIn,
      zoomOut,
      resetZoom,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      handleUndo,
      handleRedo,
      exitEditor,
    }),
    [
      glyph,
      metrics,
      contours,
      activeTool,
      points.selectedPoint,
      smoothStates,
      display,
      canvas.pan,
      canvas.zoom,
      canvas.isPanning,
      canvas.containerRef,
      canvas.handleWheel,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleCanvasClick,
      mousePos,
      zoomIn,
      zoomOut,
      resetZoom,
      history.canUndo,
      history.canRedo,
      handleUndo,
      handleRedo,
      exitEditor,
    ],
  );

  return (
    <GlyphEditorContext.Provider value={value}>
      {children}
    </GlyphEditorContext.Provider>
  );
}
