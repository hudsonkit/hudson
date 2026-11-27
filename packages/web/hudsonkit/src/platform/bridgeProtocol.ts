// ---------------------------------------------------------------------------
// The Hudson host bridge wire protocol (HUD-015 §9, §13), version 1.
//
// Shared by every native host that is not Electron (Electron's preload hands
// the bridge objects over directly). The Swift side lives in
// HudsonUIWeb/HudWebBridge.swift and must match this file.
//
// Page → host: `window.webkit.messageHandlers[handler].postMessage(request)`.
//   The host replies through WKScriptMessageHandlerWithReply.
// Host → page: the host evaluates `window[global].receive(event)`.
//   A user script installs a buffer at document start, so events that arrive
//   before the app mounts wait until the adapter connects.
// ---------------------------------------------------------------------------
import type { ActivityRef, ActivitySnapshot } from '../types/activity';

export const HUDSON_BRIDGE_VERSION = 1;
/** Default WKScriptMessageHandler name. */
export const HUDSON_BRIDGE_HANDLER = 'hudsonBridge';
/** Default window global the host evaluates into. */
export const HUDSON_BRIDGE_GLOBAL = '__hudsonBridge';
/** Events the document-start buffer keeps before the adapter connects. */
export const HUDSON_BRIDGE_BUFFER_LIMIT = 100;

/** Page → host requests. Each gets one reply. */
export type HudsonBridgeRequest =
  | { op: 'hello'; version: number }
  | { op: 'activities.list' }
  | { op: 'activities.send'; ref: ActivityRef; command: string; args?: unknown };

/** The host's answer to `hello`. */
export interface HudsonBridgeHello {
  version: number;
  /** Which bridges the host serves: 'commands', 'activities'. */
  capabilities: string[];
}

/** Host → page events. */
export type HudsonBridgeEvent =
  | { type: 'command'; command: string; args?: unknown }
  | { type: 'activity'; snapshot: ActivitySnapshot };

/** What the host evaluates into. The buffer and the live adapter share it. */
export interface HudsonBridgeGlobal {
  receive(event: unknown): void;
  /** Events received before the adapter connected, with when they arrived (ms). */
  queue?: Array<{ event: unknown; at: number }>;
}

/**
 * The user script a host installs at document start. Kept here so the Swift
 * side can embed it verbatim (and a test can check the two stay in step).
 */
export function hudsonBridgeBootstrapScript(global = HUDSON_BRIDGE_GLOBAL, limit = HUDSON_BRIDGE_BUFFER_LIMIT): string {
  const key = JSON.stringify(global);
  return `(function(){var w=window,k=${key};if(w[k])return;var q=[];w[k]={queue:q,receive:function(e){q.push({event:e,at:Date.now()});if(q.length>${limit})q.shift();}};})();`;
}

export function isBridgeEvent(value: unknown): value is HudsonBridgeEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'command') return typeof v.command === 'string';
  if (v.type === 'activity') return isActivitySnapshot(v.snapshot);
  return false;
}

export function isActivitySnapshot(value: unknown): value is ActivitySnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const ref = v.ref as Record<string, unknown> | undefined;
  return (
    !!ref &&
    typeof ref.kind === 'string' &&
    typeof ref.id === 'string' &&
    typeof v.state === 'string' &&
    (v.lifetime === 'ui' || v.lifetime === 'host') &&
    Array.isArray(v.controls)
  );
}
