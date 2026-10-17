/**
 * TalkieContext — shared state for the Talkie wordmark studio.
 * Allows the Inspector panel to read/write the same params as the controls.
 */

import { createContext, useContext } from 'react';
import type { TalkieParams } from './types';

interface TalkieContextValue {
  params: TalkieParams;
  onChange: (p: TalkieParams) => void;
  onResetAll: () => void;
  onResetGlyph: (char: string) => void;
}

const TalkieCtx = createContext<TalkieContextValue | null>(null);

export function TalkieProvider({
  params,
  onChange,
  onResetAll,
  onResetGlyph,
  children,
}: {
  params: TalkieParams;
  onChange: (p: TalkieParams) => void;
  onResetAll: () => void;
  onResetGlyph: (char: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TalkieCtx.Provider value={{ params, onChange, onResetAll, onResetGlyph }}>
      {children}
    </TalkieCtx.Provider>
  );
}

export function useTalkieParams(): TalkieContextValue | null {
  return useContext(TalkieCtx);
}
