'use client';

import { useDocs } from './DocsProvider';
import { NAV_ITEMS, COMPONENTS, AGENT_DOCS } from './data';

// Each nav item lands somewhere visible on the canvas.
const NAV_SHEETS: Record<string, string[]> = {
  overview: [],
  guides: AGENT_DOCS.map(d => `agent:${d.slug}`),
  layout: ['frame', 'side-panel', 'navigation-bar', 'status-bar'],
};

export function DocsLeftPanel() {
  const { activeNav, setActiveNav, openSheets, toggleSheet, playSound, showSheets, setViewMode } = useDocs();

  return (
    <>
      <div className="py-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'settings') {
                  // Trigger shell settings via keyboard event
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true }));
                  playSound('click');
                  return;
                }
                setActiveNav(item.id);
                if (item.id === 'reference') {
                  setViewMode('list');
                  playSound('click');
                } else if (item.id === 'theming') {
                  window.dispatchEvent(new CustomEvent('hudson:open-app', { detail: { appId: 'theme-designer' } }));
                } else {
                  showSheets(NAV_SHEETS[item.id] ?? []);
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent border-l-2 border-accent'
                  : 'text-muted-foreground hover:bg-accent/8 hover:text-foreground border-l-2 border-transparent'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-accent' : 'text-muted-foreground'} />
              <span className="text-[12px] font-mono tracking-wider uppercase">{item.label}</span>
            </button>
          );
        })}
      </div>
      {/* Reference cards */}
      <div className="border-t border-border/60 pt-2 pb-2">
        <div className="px-4 py-2 text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Reference</div>
        {COMPONENTS.map(c => {
          const Icon = c.icon;
          const isOpen = openSheets.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => { toggleSheet(c.id); }}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                isOpen
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted-foreground hover:bg-accent/8 hover:text-foreground'
              }`}
            >
              <Icon size={12} className={isOpen ? 'text-accent' : 'text-muted-foreground'} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono tracking-wider truncate">{c.label}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">{c.ns}</div>
              </div>
              {isOpen && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
