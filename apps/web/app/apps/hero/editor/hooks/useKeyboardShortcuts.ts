import { useEffect } from "react";
import type { EditorTool } from "../types";

interface KeyboardShortcutActions {
  setTool: (tool: EditorTool) => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  deletePoint: () => void;
  nudge: (dx: number, dy: number) => void;
  deselect: () => void;
  exitEditor: () => void;
  resetZoom: () => void;
  setSpaceHeld: (held: boolean) => void;
}

/**
 * Keyboard shortcuts for the glyph editor.
 * V=select, P=pen, H=hand, Space=temp hand,
 * Cmd+Z/Cmd+Shift+Z=undo/redo, Cmd+S=save,
 * Delete=delete point, Arrows=nudge, Escape=deselect/exit, 0=reset zoom
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+Z / Cmd+Shift+Z
      if (meta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
        return;
      }

      // Cmd+S
      if (meta && e.key === "s") {
        e.preventDefault();
        actions.save();
        return;
      }

      // Tool shortcuts (only without modifiers)
      if (!meta && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "v":
            actions.setTool("select");
            return;
          case "p":
            actions.setTool("pen");
            return;
          case "h":
            actions.setTool("hand");
            return;
          case " ":
            e.preventDefault();
            actions.setSpaceHeld(true);
            return;
          case "0":
            actions.resetZoom();
            return;
          case "escape":
            actions.deselect();
            return;
          case "delete":
          case "backspace":
            actions.deletePoint();
            return;
          case "arrowleft":
            e.preventDefault();
            actions.nudge(e.shiftKey ? -10 : -1, 0);
            return;
          case "arrowright":
            e.preventDefault();
            actions.nudge(e.shiftKey ? 10 : 1, 0);
            return;
          case "arrowup":
            e.preventDefault();
            actions.nudge(0, e.shiftKey ? 10 : 1);
            return;
          case "arrowdown":
            e.preventDefault();
            actions.nudge(0, e.shiftKey ? -10 : -1);
            return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        actions.setSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [actions]);
}
