'use client';

/**
 * EmbedDriver — lets the host page drive the live workspace through the same
 * tool surface Hudson's agent uses (`hudson:tool-call` → the shell's tool
 * handler). The landing page's narrated walkthrough is built on it.
 *
 * Only neutral moves are relayed: opening and arranging windows, panels, the
 * palette, the console, and a prompt typed into Hudson AI (never sent).
 * Nothing here writes settings, calls a model, or touches the network.
 *
 * Protocol (no data beyond these fields crosses it):
 *   host → embed  { type: 'hudson:drive', name, args }
 *   embed → host  { type: 'hudson:drive-ready' }        shell is listening
 *                 { type: 'hudson:drive-interrupted' }  the visitor took over
 */

import { useEffect } from 'react';

const APPS = new Set(['hudson-docs', 'hudson-ai', 'intent-explorer', 'theme-designer', 'code-editor']);
const COMMANDS = new Set(['shell:auto-layout', 'shell:reset-view', 'view-canvas', 'view-list', 'view-tiles']);

type Args = Record<string, unknown>;

/** Returns sanitized args for an allowed call, or null to drop it. */
function allow(name: string, args: Args): Args | null {
  switch (name) {
    case 'set_panel':
      return (args.side === 'left' || args.side === 'right') && typeof args.collapsed === 'boolean'
        ? { side: args.side, collapsed: args.collapsed }
        : null;
    case 'open_command_palette':
      return { query: typeof args.query === 'string' ? args.query.slice(0, 40) : '' };
    case 'close_command_palette':
      return {};
    case 'set_console':
      return typeof args.open === 'boolean' ? { open: args.open } : null;
    case 'queue_ai_prompt':
      return typeof args.text === 'string' ? { text: args.text.slice(0, 140) } : null;
    case 'set_app_state': {
      if (typeof args.appId !== 'string' || !APPS.has(args.appId)) return null;
      const out: Args = { appId: args.appId };
      if (typeof args.visible === 'boolean') out.visible = args.visible;
      if (args.focused === true) out.focused = true;
      return out;
    }
    case 'run_command':
      return typeof args.commandId === 'string' && COMMANDS.has(args.commandId) ? { commandId: args.commandId } : null;
    default:
      return null;
  }
}

function toHost(message: { type: string }) {
  try {
    if (window.parent !== window) window.parent.postMessage(message, '*');
  } catch {
    /* no parent */
  }
}

export function EmbedDriver() {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || window.parent === window) return;
      const data = e.data as { type?: string; name?: string; args?: Args } | null;
      if (!data || data.type !== 'hudson:drive' || typeof data.name !== 'string') return;
      const args = allow(data.name, data.args ?? {});
      if (!args) return;
      window.dispatchEvent(new CustomEvent('hudson:tool-call', { detail: { name: data.name, args } }));
    };
    window.addEventListener('message', onMessage);

    // The shell registers its listener in an effect; tell the host once the
    // page has settled so the first moves aren't dropped.
    const ready = window.setTimeout(() => toHost({ type: 'hudson:drive-ready' }), 600);

    // A real click or key press inside the frame means the visitor wants the
    // controls: the host pauses its walkthrough.
    const onTrusted = (e: Event) => {
      if (e.isTrusted) toHost({ type: 'hudson:drive-interrupted' });
    };
    window.addEventListener('pointerdown', onTrusted, true);
    window.addEventListener('keydown', onTrusted, true);
    window.addEventListener('wheel', onTrusted, { capture: true, passive: true });

    return () => {
      window.clearTimeout(ready);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pointerdown', onTrusted, true);
      window.removeEventListener('keydown', onTrusted, true);
      window.removeEventListener('wheel', onTrusted, true);
    };
  }, []);

  return null;
}
