'use client';

import { Caliper } from './Caliper';
import { DraftingCursor } from './DraftingCursor';
import { LensMagnifier } from './LensMagnifier';
import { useTunable } from '../useTunable';

export { FxProvider, useFx, FX_DEFAULTS, type FxState, type FxContextValue } from './FxContext';
export { InlineDraftingToolbar } from './InlineDraftingToolbar';
export { PlotterReveal, type PlotterRevealProps } from './PlotterReveal';
export { ToolShelf } from './ToolShelf';

export function DraftingFxLayers() {
  // Instruments are a design-review tool; visitors never get the overlays.
  if (!useTunable()) return null;
  return (
    <>
      <LensMagnifier />
      <DraftingCursor />
      <Caliper />
    </>
  );
}
