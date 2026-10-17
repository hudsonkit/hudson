// @ts-nocheck
'use client';

import { createElement } from 'react';
import type { HudsonApp } from 'hudsonkit';
import { BookOpen, ScanSearch } from 'hudsonkit/icons';
import { HeroProvider } from './HeroProvider';
import { HeroContent } from './HeroContent';
import { HeroLeftPanel } from './HeroLeftPanel';
import { HeroInspector } from './HeroInspector';
import { HeroLeftFooter } from './HeroLeftFooter';
import { HeroTerminal } from './HeroTerminal';
import {
  useHeroCommands,
  useHeroStatus,
  useHeroSearch,
  useHeroNavCenter,
  useHeroNavActions,
  useHeroLayoutMode,
} from './hooks';
import { useHeroPortOutput } from './ports';
import { heroIntents } from './intents';

export const heroApp: HudsonApp = {
  id: 'hero',
  name: 'Hero',
  description: 'Font viewer and glyph editor',
  mode: 'panel',

  leftPanel: {
    title: 'Library',
    icon: createElement(BookOpen, { size: 12 }),
  },

  rightPanel: {
    title: 'Inspector',
    icon: createElement(ScanSearch, { size: 12 }),
  },

  Provider: HeroProvider,

  slots: {
    Content: HeroContent,
    LeftPanel: HeroLeftPanel,
    Inspector: HeroInspector,
    LeftFooter: HeroLeftFooter,
    Terminal: HeroTerminal,
  },

  ports: {
    outputs: [
      { id: 'glyph-svg', name: 'Glyph SVG', dataType: 'svg', description: 'Selected glyph as a normalized SVG path' },
    ],
    inputs: [],
  },

  intents: heroIntents,

  hooks: {
    useCommands: useHeroCommands,
    useStatus: useHeroStatus,
    useSearch: useHeroSearch,
    useNavCenter: useHeroNavCenter,
    useNavActions: useHeroNavActions,
    useLayoutMode: useHeroLayoutMode,
    usePortOutput: useHeroPortOutput,
  },
};
