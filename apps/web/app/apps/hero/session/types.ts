import type { HeroFont } from "../types";
import type { PathCommand } from "../types";

export interface HeroSession {
  version: "3.0.0";
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  font: HeroFont;
  glyphEdits: Record<number, GlyphEditState>;
  source: {
    fileName: string;
    format: string;
  };
}

export interface GlyphEditState {
  dirty: boolean;
  originalPath: PathCommand[];
  sourceFormat: "quadratic" | "cubic" | "mixed";
  smoothStates: Record<string, boolean>;
  undoStack: string[];
  undoIndex: number;
}
