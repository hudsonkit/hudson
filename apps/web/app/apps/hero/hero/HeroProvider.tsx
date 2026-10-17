// @ts-nocheck
'use client';

import type { ReactNode } from 'react';
import { LibraryProvider } from '../library/LibraryProvider';
import { SessionProvider } from '../session/SessionProvider';
import { HeroAppProvider } from './HeroAppContext';

export function HeroProvider({ children }: { children: ReactNode }) {
  return (
    <LibraryProvider>
      <SessionProvider>
        <HeroAppProvider>{children}</HeroAppProvider>
      </SessionProvider>
    </LibraryProvider>
  );
}
