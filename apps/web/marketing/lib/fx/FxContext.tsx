'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type FxState = {
  cursor: boolean;
  lens: boolean;
  caliper: boolean;
  plotter: boolean;
  plotSpeed: number;
  plotRails: boolean;
  lensZoom: number;
};

export type FxContextValue = {
  fx: FxState;
  setFx: (patch: Partial<FxState> | ((prev: FxState) => FxState)) => void;
};

export const FX_DEFAULTS: FxState = {
  cursor: false,
  lens: false,
  caliper: false,
  plotter: true,
  plotSpeed: 0.3,
  plotRails: true,
  lensZoom: 2.4,
};

const FX_KEY = 'hud-fx-v2';

function readFx(): FxState {
  if (typeof window === 'undefined') return { ...FX_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(FX_KEY);
    // Caliper, lens, and cursor are momentary instruments: keep their tuning
    // (zoom, speed) but always start with them off so a page load never
    // opens with overlays following the pointer.
    return raw
      ? { ...FX_DEFAULTS, ...JSON.parse(raw), caliper: false, lens: false, cursor: false }
      : { ...FX_DEFAULTS };
  } catch {
    return { ...FX_DEFAULTS };
  }
}

function writeFx(s: FxState) {
  try {
    window.localStorage.setItem(FX_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

const FxContext = createContext<FxContextValue>({ fx: FX_DEFAULTS, setFx: () => {} });

export function FxProvider({ children }: { children: ReactNode }) {
  const [fx, setFxState] = useState<FxState>(FX_DEFAULTS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of fx prefs from storage after mount (SSR ships defaults); runs once, not a cascade
    setFxState(readFx());
  }, []);

  const setFx = useCallback<FxContextValue['setFx']>((patch) => {
    setFxState((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      writeFx(next);
      return next;
    });
  }, []);

  return <FxContext.Provider value={{ fx, setFx }}>{children}</FxContext.Provider>;
}

export const useFx = () => useContext(FxContext);
