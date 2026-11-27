'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
import { Search, CornerDownLeft } from '../../icons';
import { HObservabilityDefault } from '../../observability';
import type { FeatureFlagGate } from '../../flags/types';

export interface CommandOption {
  id: string;
  label: string;
  action: () => void;
  shortcut?: string;
  icon?: React.ReactNode;
  flag?: FeatureFlagGate;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandOption[];
  /** Drive the search field from outside (a walkthrough or agent typing). */
  query?: string;
}

const chromeBorderStyle = {
  borderColor: 'var(--hud-chrome-border, oklch(var(--border)))',
} satisfies React.CSSProperties;

const focusRingStyle = {
  '--tw-ring-color': 'color-mix(in srgb, var(--hud-accent, currentColor) 34%, transparent)',
} as React.CSSProperties;

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands, query: drivenQuery }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteId = useId();
  const listboxId = `${paletteId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      HObservabilityDefault.logger.info('hudson.command_palette.open', {
        category: 'command',
        data: { commandCount: commands.length },
      });
      inputRef.current?.focus({ preventScroll: true });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset of query/selection in reaction to the palette opening (isOpen dep), not a per-render cascade
      setQuery('');
      setSelectedIndex(0);
    }
  }, [commands.length, isOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors a driven query into the field; runs only when the driver changes it
  useEffect(() => { if (isOpen && drivenQuery !== undefined) setQuery(drivenQuery); }, [drivenQuery, isOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the highlighted row when the query changes; a bounded reaction to a single dep, not a cascade
  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = (cmd: CommandOption, source: 'keyboard' | 'pointer') => {
    const span = HObservabilityDefault.trace.start('hudson.command.execute', {
      category: 'command',
      data: {
        commandId: cmd.id,
        surface: 'command_palette',
        source,
        queryLength: query.length,
        resultCount: filteredCommands.length,
      },
    });
    try {
      cmd.action();
      span.end();
      onClose();
    } catch (error) {
      span.error(error);
      throw error;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && filteredCommands.length === 0) {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % filteredCommands.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[selectedIndex]) { executeCommand(filteredCommands[selectedIndex], 'keyboard'); } }
    else if (e.key === 'Escape') { onClose(); }
  };


  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = paletteRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const activeOptionId = filteredCommands[selectedIndex]
    ? `${paletteId}-option-${selectedIndex}`
    : undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-background/45 backdrop-blur-[2px] pointer-events-auto" onClick={onClose}>
      <div
        ref={paletteRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[640px] max-w-[90vw] bg-popover border shadow-2xl rounded-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        style={chromeBorderStyle}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Search input */}
        <div
          className="flex items-center px-4 py-3 border-b gap-3 focus-within:ring-2 focus-within:outline-none"
          style={{ ...chromeBorderStyle, ...focusRingStyle }}
        >
          <Search className="text-muted-foreground" size={16} strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-popover-foreground placeholder:text-muted-foreground font-mono text-[12px] font-normal"
            style={{ boxShadow: 'none' }}
            placeholder="Type a command or search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
          />
          <div className="px-1.5 py-0.5 rounded bg-muted border text-[10px] text-muted-foreground font-mono tracking-[0.12em]" style={chromeBorderStyle} aria-hidden="true">ESC</div>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-2 relative">
          <div id={listboxId} role="listbox" aria-label="Command results" className="pb-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-[11px] font-mono" role="status">No matching commands</div>
            ) : (
              filteredCommands.map((cmd, idx) => (
              <div
                key={cmd.id}
                id={`${paletteId}-option-${idx}`}
                ref={idx === selectedIndex ? selectedRef : null}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                  idx === selectedIndex ? 'bg-accent/10 border-l-2 border-accent' : 'border-l-2 border-transparent hover:bg-muted/70'
                }`}
                onClick={() => executeCommand(cmd, 'pointer')}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                {cmd.icon && <div className={`${idx === selectedIndex ? 'text-accent' : 'text-muted-foreground'}`}>{cmd.icon}</div>}
                <div className="flex-1">
                  <div className={`text-[12px] ${idx === selectedIndex ? 'text-accent font-medium' : 'text-foreground/80 font-normal'}`}>{cmd.label}</div>
                </div>
                {cmd.shortcut && (
                  <div className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border tracking-[0.04em]" style={chromeBorderStyle}>{cmd.shortcut}</div>
                )}
                {idx === selectedIndex && <CornerDownLeft size={14} className="text-accent ml-2" aria-hidden="true" />}
              </div>
              ))
            )}
          </div>
          {/* Fade gradient at bottom when scrollable */}
          {filteredCommands.length > 6 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-popover to-transparent pointer-events-none" />
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-1.5 bg-card/90 backdrop-blur-sm border-t flex justify-between items-center text-[10px] text-muted-foreground font-mono relative z-10 tracking-[0.18em] uppercase"
          style={chromeBorderStyle}
        >
          <span>Command Palette</span>
          <span className="tracking-[0.04em] normal-case">{filteredCommands.length} matches</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
