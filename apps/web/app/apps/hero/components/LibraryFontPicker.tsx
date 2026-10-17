import { useState } from "react";
import { useLibrary } from "../library/LibraryProvider";
import type { LibraryFontMeta } from "../library/types";

interface LibraryFontPickerProps {
  onPick: (id: string) => void;
  onClose: () => void;
  excludeFileNames?: string[];
}

export function LibraryFontPicker({ onPick, onClose, excludeFileNames = [] }: LibraryFontPickerProps) {
  const { fonts } = useLibrary();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = fonts.filter((f) => {
    if (excludeFileNames.includes(f.fileName)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (f.familyName?.toLowerCase().includes(q)) ||
      (f.subfamilyName?.toLowerCase().includes(q)) ||
      f.fileName.toLowerCase().includes(q)
    );
  });

  const handlePick = async (meta: LibraryFontMeta) => {
    setLoading(meta.id);
    try {
      await onPick(meta.id);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium">Add from Library</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer text-lg"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3">
          <input
            type="text"
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="
              w-full px-3 py-2 text-xs rounded-lg
              bg-muted border border-border
              text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:border-[var(--color-accent)]
            "
          />
        </div>

        {/* Font list */}
        <div className="flex-1 overflow-auto px-5 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {search ? `No fonts match "${search}"` : "No fonts in library"}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((meta) => (
                <button
                  key={meta.id}
                  onClick={() => handlePick(meta)}
                  disabled={loading !== null}
                  className="
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    hover:bg-accent transition-colors cursor-pointer
                    disabled:opacity-50 disabled:cursor-wait
                  "
                >
                  <span className="text-lg font-serif opacity-50 w-8 text-center">Aa</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {meta.familyName ?? meta.fileName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {meta.subfamilyName ?? ""}{meta.source === "sample" ? " · sample" : ""}
                    </div>
                  </div>
                  {loading === meta.id && (
                    <span className="text-[10px] text-muted-foreground animate-pulse">
                      loading...
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
