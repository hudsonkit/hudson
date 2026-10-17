import { useCallback, useRef } from "react";
import type { EditableContour } from "../types";

const MAX_UNDO = 100;
const DEBOUNCE_MS = 300;

interface EditorHistory {
  pushSnapshot: (contours: EditableContour[]) => void;
  undo: () => EditableContour[] | null;
  redo: () => EditableContour[] | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: (contours: EditableContour[]) => void;
}

/**
 * Per-glyph undo/redo stack using JSON snapshots.
 * Debounces rapid changes (300ms) and caps at 100 entries.
 */
export function useEditorHistory(): EditorHistory {
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback((contours: EditableContour[]) => {
    const snapshot = JSON.stringify(contours);
    stackRef.current = [snapshot];
    indexRef.current = 0;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pushSnapshot = useCallback((contours: EditableContour[]) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const snapshot = JSON.stringify(contours);
      const stack = stackRef.current;
      const idx = indexRef.current;

      // Don't push if identical to current
      if (stack[idx] === snapshot) return;

      // Truncate any redo history
      const newStack = stack.slice(0, idx + 1);
      newStack.push(snapshot);

      // Cap at MAX_UNDO
      if (newStack.length > MAX_UNDO) {
        newStack.shift();
      }

      stackRef.current = newStack;
      indexRef.current = newStack.length - 1;
      timerRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  const undo = useCallback((): EditableContour[] | null => {
    // Flush pending snapshot
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const idx = indexRef.current;
    if (idx <= 0) return null;

    indexRef.current = idx - 1;
    return JSON.parse(stackRef.current[idx - 1]!);
  }, []);

  const redo = useCallback((): EditableContour[] | null => {
    const idx = indexRef.current;
    const stack = stackRef.current;
    if (idx >= stack.length - 1) return null;

    indexRef.current = idx + 1;
    return JSON.parse(stack[idx + 1]!);
  }, []);

  return {
    pushSnapshot,
    undo,
    redo,
    get canUndo() {
      return indexRef.current > 0;
    },
    get canRedo() {
      return indexRef.current < stackRef.current.length - 1;
    },
    reset,
  };
}
