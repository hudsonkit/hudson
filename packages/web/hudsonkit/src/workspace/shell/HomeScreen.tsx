'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info } from '../../icons';
import type { HudsonWorkspace } from '../../index';

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
interface HudsonSession {
  activeWorkspaceId: string;
  timestamp: number;
}

const SESSION_KEY = 'hudson.session';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

export function loadSession(): HudsonSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: HudsonSession = JSON.parse(raw);
    if (Date.now() - session.timestamp > SESSION_MAX_AGE) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession(workspaceId: string) {
  try {
    const session: HudsonSession = {
      activeWorkspaceId: workspaceId,
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

// ---------------------------------------------------------------------------
// App info blurbs — keyed by app id
// ---------------------------------------------------------------------------
interface AppInfo {
  summary: string;
  bullets: string[];
  link?: { label: string; url: string };
}

const APP_INFO: Record<string, AppInfo> = {
  'hudson-docs': {
    summary: 'Interactive documentation and component explorer for the Hudson platform.',
    bullets: [
      'Browse SDK components, hooks, and types',
      'Live previews with editable props',
      'Search across all documentation pages',
    ],
  },
  'intent-explorer': {
    summary: 'Inspect and test the intent routing system across all registered apps.',
    bullets: [
      'View all registered intents and their handlers',
      'Fire test intents and observe responses',
      'Debug cross-app communication in real time',
    ],
  },
  'trace-viewer': {
    summary: 'Visualize and inspect agent execution traces — see what your AI agents did, step by step.',
    bullets: [
      'Timeline view with waterfall duration bars for every tool call',
      'Drill into any step to inspect inputs, outputs, and token usage',
      'Works with any agent: Claude Code, OpenClaw, or custom traces',
    ],
  },
};

// ---------------------------------------------------------------------------
// InfoPopout — detail overlay anchored to the grid
// ---------------------------------------------------------------------------
function InfoPopout({ appId, name, onClose }: { appId: string; name: string; onClose: () => void }) {
  const info = APP_INFO[appId];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="w-[420px] max-w-[90vw] rounded-xl overflow-hidden"
        style={{
          background: 'rgba(24,24,24,0.98)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-[16px] font-mono font-semibold tracking-wide text-white">{name}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors text-neutral-400 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {info ? (
            <>
              <p className="text-[13px] font-mono text-neutral-300 leading-relaxed">
                {info.summary}
              </p>
              <ul className="space-y-2">
                {info.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[13px] font-mono text-neutral-400 leading-relaxed">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-neutral-500 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              {info.link && (
                <a
                  href={info.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[12px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {info.link.label} &rarr;
                </a>
              )}
            </>
          ) : (
            <p className="text-[13px] font-mono text-neutral-500">No additional info available.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AppLauncher — frosted overlay with multi-select cards
// ---------------------------------------------------------------------------
interface AppLauncherProps {
  workspace: HudsonWorkspace;
  activatedAppIds: Set<string>;
  onActivateApp: (appId: string) => void;
  onDismiss: () => void;
}

export function AppLauncher({ workspace, activatedAppIds, onActivateApp, onDismiss }: AppLauncherProps) {
  const [exiting, setExiting] = useState(false);
  const [infoAppId, setInfoAppId] = useState<{ id: string; name: string } | null>(null);
  const hasActivated = activatedAppIds.size > 0;

  const handleDismiss = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    // Let fade-out animation play before signaling parent
    setTimeout(onDismiss, 400);
  }, [exiting, onDismiss]);

  // Keyboard: Escape or Enter to dismiss (only when info popout is closed)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (infoAppId) return; // let popout handle its own Escape
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDismiss, infoAppId]);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(8,8,10,0.92)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-col items-center gap-12 max-w-[720px] w-full px-6">
        {/* Branding */}
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
        >
          <h1 className="text-[32px] font-brand font-bold tracking-[0.3em] text-zinc-100">
            HUDSON
          </h1>
          {/* Breathing bar — pure CSS, GPU-composited via transform */}
          <div
            className="h-px w-9 bg-accent"
            style={{ animation: 'breathe 3s ease-in-out infinite', willChange: 'transform, opacity' }}
          />
          <span className="text-[12px] font-mono tracking-[0.2em] text-neutral-500">
            hudsonkit.com
          </span>
        </motion.div>

        {/* App cards */}
        <div
          className="grid gap-5 w-full"
          style={{ gridTemplateColumns: `repeat(${Math.min(workspace.apps.length + 1, 3)}, 1fr)` }}
        >
          {workspace.apps.map((config, i) => {
            const { app } = config;
            const isActive = activatedAppIds.has(app.id);

            return (
              <motion.button
                key={app.id}
                onClick={() => onActivateApp(app.id)}
                className="group relative flex flex-col items-start gap-4 p-6 rounded-xl text-left cursor-pointer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.85, y: 0 }}
                whileHover={{
                  opacity: 1,
                  scale: 1.02,
                }}
                transition={{
                  // Entrance uses delay; hover/tap override with immediate timing
                  default: { duration: 0.35, delay: 0.1 + i * 0.06, ease: [0.25, 1, 0.5, 1] },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                }}
                style={{
                  // Flat cards; the active one is marked by its border alone.
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                  border: isActive
                    ? '1px solid oklch(var(--accent) / 0.55)'
                    : '1px solid rgba(255,255,255,0.10)',
                }}
                whileTap={{ scale: 0.97 }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full" style={{ background: 'oklch(var(--accent))' }} />
                )}

                {/* App name */}
                <h2 className={`text-[18px] font-mono font-semibold tracking-wide transition-colors ${
                  'text-neutral-100 group-hover:text-white'
                }`}>
                  {app.name}
                </h2>

                {/* Description */}
                {app.description && (
                  <p className="text-[13px] font-mono text-neutral-400 leading-relaxed">
                    {app.description}
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between w-full mt-auto pt-3">
                  <span
                    onClick={(e) => { e.stopPropagation(); setInfoAppId({ id: app.id, name: app.name }); }}
                    className="flex items-center gap-1.5 text-[11px] font-mono tracking-[0.08em] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                  >
                    <Info size={10} />
                    More info
                  </span>
                  <span className={`text-[12px] font-mono transition-colors ${
                    isActive ? 'text-neutral-300' : 'text-neutral-500 group-hover:text-neutral-200'
                  }`}>
                    {isActive ? 'Active' : 'Open \u2192'}
                  </span>
                </div>

              </motion.button>
            );
          })}

          {/* Coming soon — OpenClaw */}
          <motion.div
            className="group relative flex flex-col items-start gap-4 p-6 rounded-xl text-left"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.85, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + workspace.apps.length * 0.06, ease: [0.25, 1, 0.5, 1] }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <h2 className="text-[18px] font-mono font-semibold tracking-wide text-neutral-100">
              OpenClaw
            </h2>
            <p className="text-[13px] font-mono text-neutral-400 leading-relaxed">
              UI for collaborating with your claws
            </p>
            <div className="flex items-center justify-between w-full mt-auto pt-3">
              <span
                onClick={() => setInfoAppId({ id: 'openclaw', name: 'OpenClaw' })}
                className="flex items-center gap-1.5 text-[11px] font-mono tracking-[0.08em] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
              >
                <Info size={10} />
                More info
              </span>
              <span className="text-[11px] font-mono tracking-[0.12em] uppercase text-neutral-500">
                Coming soon
              </span>
            </div>
          </motion.div>
        </div>

        {/* Hint + Enter button */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <AnimatePresence mode="wait">
            {hasActivated ? (
              <motion.button
                key="enter"
                onClick={handleDismiss}
                className="px-6 py-2 rounded-lg font-mono text-[13px] tracking-[0.15em] uppercase cursor-pointer transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: 'rgb(229, 229, 229)',
                }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                whileHover={{ scale: 1.03, borderColor: 'rgba(255,255,255,0.32)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                Enter workspace
              </motion.button>
            ) : (
              <motion.p
                key="hint"
                className="text-[14px] font-mono tracking-[0.15em] text-neutral-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                initialize modules
              </motion.p>
            )}
          </AnimatePresence>
          <motion.p
            className="text-[11px] font-mono tracking-[0.15em] text-neutral-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: hasActivated ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            press enter or esc to continue
          </motion.p>
        </motion.div>
      </div>

      {/* Info popout */}
      <AnimatePresence>
        {infoAppId && (
          <InfoPopout
            appId={infoAppId.id}
            name={infoAppId.name}
            onClose={() => setInfoAppId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
