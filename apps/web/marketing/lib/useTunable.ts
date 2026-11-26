'use client';

import { useEffect, useState } from 'react';

/**
 * Design tooling (Studio console, drafting instruments) is for the team, not
 * visitors: it shows in dev, or in any build with `?tune` in the URL.
 * Starts false so SSR and first paint never include the tools.
 */
export function useTunable(): boolean {
  const [tunable, setTunable] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of env + URL after mount; SSR ships the visitor (tools-off) state
    setTunable(
      process.env.NODE_ENV === 'development' ||
        new URLSearchParams(window.location.search).has('tune'),
    );
  }, []);
  return tunable;
}
