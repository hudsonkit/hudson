import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { HeroFont, PathCommand } from "../types";
import type { HeroSession, GlyphEditState } from "./types";
import { saveSession, getLastSession } from "./SessionStore";
import { detectSourceFormat } from "../lib/path-convert";

interface SessionContextValue {
  session: HeroSession | null;
  saveStatus: "saved" | "saving" | "unsaved";
  createSession: (font: HeroFont, fileName: string) => void;
  closeSession: () => void;
  updateGlyphPath: (glyphIndex: number, path: PathCommand[]) => void;
  getGlyphEditState: (glyphIndex: number) => GlyphEditState | undefined;
  initGlyphEdit: (glyphIndex: number) => GlyphEditState;
  updateGlyphEditState: (glyphIndex: number, state: GlyphEditState) => void;
  exportSessionFile: () => void;
  exportFontJSON: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<HeroSession | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore last session on mount
  useEffect(() => {
    getLastSession().then((s) => {
      if (s) setSession(s);
    });
  }, []);

  // Auto-save with 2s debounce
  useEffect(() => {
    if (!session) return;

    setSaveStatus("unsaved");

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const updated = { ...session, updatedAt: new Date().toISOString() };
      setSaveStatus("saving");
      saveSession(updated).then(() => {
        setSaveStatus("saved");
      });
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [session]);

  const createSession = useCallback((font: HeroFont, fileName: string) => {
    const now = new Date().toISOString();
    const s: HeroSession = {
      version: "3.0.0",
      id: crypto.randomUUID(),
      name: font.metadata.familyName ?? fileName.replace(/\.[^.]+$/, ""),
      createdAt: now,
      updatedAt: now,
      font: structuredClone(font),
      glyphEdits: {},
      source: {
        fileName,
        format: fileName.endsWith(".json") ? "hero-json" : "binary",
      },
    };
    setSession(s);
    // Immediate save
    saveSession(s);
    setSaveStatus("saved");
  }, []);

  const closeSession = useCallback(() => {
    setSession(null);
    setSaveStatus("saved");
  }, []);

  const updateGlyphPath = useCallback((glyphIndex: number, path: PathCommand[]) => {
    setSession((prev) => {
      if (!prev) return prev;
      const font = { ...prev.font };
      font.glyphs = font.glyphs.map((g) =>
        g.index === glyphIndex ? { ...g, path } : g,
      );
      return { ...prev, font, updatedAt: new Date().toISOString() };
    });
  }, []);

  const getGlyphEditState = useCallback((glyphIndex: number) => {
    return session?.glyphEdits[glyphIndex];
  }, [session]);

  const initGlyphEdit = useCallback((glyphIndex: number): GlyphEditState => {
    const glyph = session?.font.glyphs.find((g) => g.index === glyphIndex);
    if (!glyph) throw new Error(`Glyph ${glyphIndex} not found`);

    const existing = session?.glyphEdits[glyphIndex];
    if (existing) return existing;

    const state: GlyphEditState = {
      dirty: false,
      originalPath: structuredClone(glyph.path),
      sourceFormat: detectSourceFormat(glyph.path),
      smoothStates: {},
      undoStack: [JSON.stringify(glyph.path)],
      undoIndex: 0,
    };

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        glyphEdits: { ...prev.glyphEdits, [glyphIndex]: state },
      };
    });

    return state;
  }, [session]);

  const updateGlyphEditState = useCallback((glyphIndex: number, state: GlyphEditState) => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        glyphEdits: { ...prev.glyphEdits, [glyphIndex]: state },
      };
    });
  }, []);

  const exportSessionFile = useCallback(() => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name}.hero`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session]);

  const exportFontJSON = useCallback(() => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session.font, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session]);

  return (
    <SessionContext.Provider
      value={{
        session,
        saveStatus,
        createSession,
        closeSession,
        updateGlyphPath,
        getGlyphEditState,
        initGlyphEdit,
        updateGlyphEditState,
        exportSessionFile,
        exportFontJSON,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
