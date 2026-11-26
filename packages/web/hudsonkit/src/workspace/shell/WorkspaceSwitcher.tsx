'use client';

import type { HudsonWorkspace } from '../../index';

interface WorkspaceSwitcherProps {
  workspaces: HudsonWorkspace[];
  activeId: string;
  onSwitch: (id: string) => void;
}

export function WorkspaceSwitcher({ workspaces, activeId, onSwitch }: WorkspaceSwitcherProps) {
  if (workspaces.length <= 1) {
    return (
      <span className="text-[11px] font-mono text-muted-foreground">
        {workspaces[0]?.name ?? 'Workspace'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0 max-w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }} data-workspace-switcher>
      {workspaces.map(ws => {
        const isActive = ws.id === activeId;
        return (
          <button
            key={ws.id}
            onClick={() => onSwitch(ws.id)}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md border text-[10px] font-mono transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none ${
              isActive
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'border-border bg-card/40 text-foreground/80 hover:bg-muted hover:text-foreground hover:border-border'
            }`}
            title={ws.description}
            aria-pressed={isActive}
          >
            {ws.name}
          </button>
        );
      })}
    </div>
  );
}
