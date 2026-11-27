'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_MODELS_REFRESH_EVENT } from '../../lib/useAIModelOptions';

const STATUS_PATH = '/api/ai/chatgpt';
const USAGE_URL = 'https://chatgpt.com/settings/usage';
const POLL_MS = 1500;

interface Status {
  signedIn: boolean;
  pending: boolean;
  url?: string;
  error?: string;
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

/**
 * "Continue with ChatGPT": use the ChatGPT plan directly, through OpenAI's
 * Sign in with ChatGPT. Local Hudson only; renders nothing where the sign-in
 * route does not exist (the hosted site).
 */
export function ChatGPTSignIn() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const wasSignedIn = useRef<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(STATUS_PATH, { cache: 'no-store' });
      if (!response.ok) return setStatus(null);
      const next = (await response.json()) as Status;
      setStatus(next);
      if (wasSignedIn.current !== null && wasSignedIn.current !== next.signedIn) {
        window.dispatchEvent(new Event(AI_MODELS_REFRESH_EVENT));
      }
      wasSignedIn.current = next.signedIn;
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!isLocalHost(window.location.hostname)) return;
    void refresh();
  }, [refresh]);

  // Poll while the browser is away at OpenAI.
  useEffect(() => {
    if (!status?.pending) return;
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, status?.pending]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    // Open the tab now, inside the click, so it is not blocked as a popup.
    const tab = window.open('about:blank', '_blank');
    try {
      const response = await fetch(STATUS_PATH, { method: 'POST' });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || 'Could not start ChatGPT sign-in');
      if (tab) tab.location.href = body.url;
      else window.open(body.url, '_blank');
    } catch (err) {
      tab?.close();
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    await fetch(`${STATUS_PATH}?cancel=1`, { method: 'DELETE' }).catch(() => undefined);
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(STATUS_PATH, { method: 'DELETE' });
      const body = (await response.json()) as { revoked?: boolean };
      setNotice(
        body.revoked
          ? 'Signed out. OpenAI revoked the sign-in.'
          : 'Signed out here, but OpenAI did not confirm the revocation. You can disconnect Hudson in ChatGPT settings.',
      );
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [refresh]);

  if (!status) return null;

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-2" data-testid="chatgpt-sign-in">
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">ChatGPT plan</div>
      {status.signedIn ? (
        <>
          <div className="text-[11px] leading-relaxed text-foreground/72">
            Using your ChatGPT plan. Pick <span className="font-mono">ChatGPT plan</span> as the AI provider below. Usage counts against your plan&apos;s limits.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={USAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-border/70 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground hover:border-info/30 hover:text-info"
            >
              Manage usage
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={signOut}
              className="inline-flex items-center rounded-md border border-border/70 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground hover:border-info/30 hover:text-info disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </>
      ) : status.pending ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground/72">
          <span>Finish signing in in the browser tab that opened.</span>
          {status.url ? (
            <a href={status.url} target="_blank" rel="noreferrer" className="text-info underline-offset-2 hover:underline">
              Reopen
            </a>
          ) : null}
          <button type="button" onClick={cancel} className="text-muted-foreground hover:text-info">
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="text-[11px] leading-relaxed text-foreground/72">
            Use your ChatGPT Plus or Pro plan instead of an API key. Hudson keeps the sign-in in its local vault.
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={signIn}
            className="inline-flex items-center rounded-md border border-info/30 bg-info/10 px-3 py-1.5 text-[11px] font-medium text-info hover:bg-info/15 disabled:opacity-50"
          >
            Continue with ChatGPT
          </button>
        </>
      )}
      {status.error && !status.signedIn && !status.pending ? (
        <div className="text-[11px] text-destructive">{status.error}</div>
      ) : null}
      {notice ? <div className="text-[11px] text-foreground/64">{notice}</div> : null}
    </div>
  );
}
