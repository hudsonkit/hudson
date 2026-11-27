'use client';

import { useDocs } from './DocsProvider';
import { COMPONENTS } from './data';

export function DocsRightPanel() {
  const {
    selectedCard, viewMode, activeNav, openSheets,
    settings, playSound, closeAllSheets,
  } = useDocs();

  const isCanvasMode = viewMode === 'canvas';
  const openCount = openSheets.size;
  const selectedEntry = selectedCard ? COMPONENTS.find(c => c.id === selectedCard) ?? null : null;

  return (
    <div className="p-4 space-y-4">
      {/* Selected component inspector */}
      {selectedEntry ? (
        <>
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Selected</div>
            <div className="flex items-center gap-2.5">
              {(() => { const I = selectedEntry.icon; return <I size={16} className="text-accent" />; })()}
              <div>
                <div className="text-[13px] font-mono font-bold text-foreground tracking-wider">{selectedEntry.label}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{selectedEntry.ns}</div>
              </div>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Attributes</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
              <div className="text-muted-foreground">namespace</div>
              <div className="text-foreground/86 truncate">{selectedEntry.ns}</div>
              <div className="text-muted-foreground">props</div>
              <div className="text-foreground">{selectedEntry.props.length}</div>
              <div className="text-muted-foreground">has_notes</div>
              <div className="text-foreground">{selectedEntry.notes && selectedEntry.notes.length > 0 ? 'true' : 'false'}</div>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Props</div>
            <div className="space-y-1.5">
              {selectedEntry.props.map(p => (
                <div key={p.name} className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono text-foreground/90">{p.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">{p.type}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Selected</div>
          <div className="text-[11px] font-mono text-muted-foreground/80">Click a component to inspect</div>
        </div>
      )}
      <div className="h-px bg-border" />
      {/* Context info — shell will inject panel/canvas state via DocsContextInfo */}
      <DocsContextInfo />
      {openCount > 0 && (
        <>
          <div className="h-px bg-border" />
          <button
            onClick={closeAllSheets}
            className="text-[10px] font-mono text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            Close all sheets
          </button>
        </>
      )}
    </div>
  );
}

// Separated so it can read docs context and receive shell viewport info
function DocsContextInfo() {
  const { viewMode, activeNav, openSheets } = useDocs();
  const openCount = openSheets.size;

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
      <div className="text-muted-foreground">hudson.view.mode</div>
      <div className="text-accent">{viewMode}</div>
      <div className="text-muted-foreground">hudson.view.nav</div>
      <div className="text-foreground">{activeNav}</div>
      <div className="text-muted-foreground">hudson.sheets.open</div>
      <div className="text-foreground">{openCount}</div>
    </div>
  );
}
