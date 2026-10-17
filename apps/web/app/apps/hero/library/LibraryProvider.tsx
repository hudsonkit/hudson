import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { HeroFont } from "../types";
import type { LibraryFontMeta } from "./types";
import {
  listFontMetas,
  addFont as storeAddFont,
  getFontBuffer,
  removeFont as storeRemoveFont,
} from "./LibraryStore";
import { SAMPLE_FONTS, sampleToMeta } from "./sampleFonts";
import { parseFontBuffer } from "../lib/parser";

interface LibraryContextValue {
  fonts: LibraryFontMeta[];
  isLoading: boolean;
  addFont: (buffer: ArrayBuffer, fileName: string) => Promise<LibraryFontMeta>;
  openFont: (id: string) => Promise<{ font: HeroFont; fileName: string }>;
  removeFont: (id: string) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [fonts, setFonts] = useState<LibraryFontMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const cacheRef = useRef<Map<string, { font: HeroFont; fileName: string }>>(
    new Map(),
  );

  // Load metas on mount, seed missing samples
  useEffect(() => {
    (async () => {
      try {
        let metas = await listFontMetas();
        const existingIds = new Set(metas.map((m) => m.id));
        const allSamples = SAMPLE_FONTS.map(sampleToMeta);
        const missing = allSamples.filter((s) => !existingIds.has(s.id));
        for (const meta of missing) {
          await storeAddFont(meta, null);
        }
        if (missing.length > 0) {
          metas = [...metas, ...missing];
        }
        setFonts(metas);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const addFont = useCallback(
    async (buffer: ArrayBuffer, fileName: string): Promise<LibraryFontMeta> => {
      // Parse to extract metadata
      const parsed = parseFontBuffer(buffer, fileName);

      const meta: LibraryFontMeta = {
        id: crypto.randomUUID(),
        source: "user",
        fileName,
        familyName: parsed.metadata.familyName,
        subfamilyName: parsed.metadata.subfamilyName,
        glyphCount: parsed.glyphCount,
        addedAt: new Date().toISOString(),
        fileSize: buffer.byteLength,
      };

      await storeAddFont(meta, buffer);
      // Cache the parsed font
      cacheRef.current.set(meta.id, { font: parsed, fileName });
      setFonts((prev) => [...prev, meta]);
      return meta;
    },
    [],
  );

  const openFont = useCallback(
    async (id: string): Promise<{ font: HeroFont; fileName: string }> => {
      // Check cache first
      const cached = cacheRef.current.get(id);
      if (cached) return cached;

      // Find meta
      const meta = fonts.find((f) => f.id === id);
      if (!meta) throw new Error(`Font ${id} not found in library`);

      // Get buffer — from IDB or fetch sample
      let buffer = await getFontBuffer(id);

      if (!buffer && meta.sampleUrl) {
        const res = await fetch(meta.sampleUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${meta.sampleUrl}`);
        buffer = await res.arrayBuffer();
        // Store the fetched buffer so we don't re-fetch
        await storeAddFont(
          { ...meta, fileSize: buffer.byteLength },
          buffer,
        );
        // Update meta in state with fileSize
        setFonts((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, fileSize: buffer!.byteLength } : f,
          ),
        );
      }

      if (!buffer) throw new Error(`No data for font ${id}`);

      const font = parseFontBuffer(buffer, meta.fileName);
      // Update glyphCount in meta if it was 0 (sample fonts)
      if (meta.glyphCount === 0) {
        const updated = { ...meta, glyphCount: font.glyphCount };
        await storeAddFont(updated, null);
        setFonts((prev) =>
          prev.map((f) => (f.id === id ? updated : f)),
        );
      }

      const result = { font, fileName: meta.fileName };
      cacheRef.current.set(id, result);
      return result;
    },
    [fonts],
  );

  const removeFont = useCallback(async (id: string): Promise<void> => {
    await storeRemoveFont(id);
    cacheRef.current.delete(id);
    setFonts((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <LibraryContext.Provider
      value={{ fonts, isLoading, addFont, openFont, removeFont }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
