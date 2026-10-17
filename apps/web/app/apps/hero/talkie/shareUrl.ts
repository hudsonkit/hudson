/**
 * URL state encoding/decoding for the Talkie Wordmark Studio.
 * Uses hash fragment (#s=...) with JSON delta + base64url encoding.
 * Only non-default params are serialized for compact URLs.
 */

import type { TalkieParams } from './types';
import { DEFAULT_PARAMS } from './types';
import type { PathCommand } from '../types';

// ── Base64url encode/decode (no padding, URL-safe) ──

function b64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

// ── Delta: only include params that differ from defaults ──

function computeDelta(params: TalkieParams): Record<string, any> {
  const delta: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if ((DEFAULT_PARAMS as any)[key] !== value) {
      delta[key] = value;
    }
  }
  return delta;
}

function applyDelta(delta: Record<string, any>): TalkieParams {
  return { ...DEFAULT_PARAMS, ...delta };
}

// ── Public API ──

interface ShareState {
  params: TalkieParams;
  overrides?: Record<string, PathCommand[]>;
}

/**
 * Encode studio state into a URL hash fragment.
 * Returns the full URL string ready for clipboard.
 */
export function encodeShareUrl(
  params: TalkieParams,
  overrides: Record<string, PathCommand[]>,
  includeOverrides: boolean,
): string {
  const payload: any = { p: computeDelta(params) };
  if (includeOverrides && Object.keys(overrides).length > 0) {
    payload.o = overrides;
  }

  const json = JSON.stringify(payload);
  const encoded = b64urlEncode(json);

  const base = window.location.origin + window.location.pathname;
  return `${base}#s=${encoded}`;
}

/**
 * Measure the URL length for display (with and without overrides).
 */
export function measureShareUrl(
  params: TalkieParams,
  overrides: Record<string, PathCommand[]>,
): { withOverrides: number; withoutOverrides: number; hasOverrides: boolean } {
  const hasOverrides = Object.keys(overrides).length > 0;
  return {
    withOverrides: hasOverrides ? encodeShareUrl(params, overrides, true).length : 0,
    withoutOverrides: encodeShareUrl(params, overrides, false).length,
    hasOverrides,
  };
}

/**
 * Decode studio state from the current URL hash.
 * Returns null if no valid state is found.
 */
export function decodeShareUrl(): ShareState | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#s=')) return null;

  try {
    const encoded = hash.slice(3); // strip '#s='
    const json = b64urlDecode(encoded);
    const payload = JSON.parse(json);

    const params = applyDelta(payload.p || {});
    const overrides = payload.o || {};

    return { params, overrides };
  } catch (e) {
    console.warn('Failed to decode share URL:', e);
    return null;
  }
}

/**
 * Clear the hash from the URL without triggering navigation.
 */
export function clearShareHash() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
