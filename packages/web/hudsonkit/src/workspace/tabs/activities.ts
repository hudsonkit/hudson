'use client';

// ---------------------------------------------------------------------------
// useActivities / useActivity (HUD-015 §13): live activity state from the
// host, through the platform adapter's activity bridge (or one the app
// passes in). Status is never persisted; with no bridge there are none.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../../platform/PlatformContext';
import { activityKey, type ActivityRef, type ActivitySnapshot, type PlatformActivityBridge } from '../../types/activity';

const EMPTY: ReadonlyMap<string, ActivitySnapshot> = new Map();

/** Every activity the host reports, keyed by `activityKey(ref)`. */
export function useActivities(bridge?: PlatformActivityBridge): ReadonlyMap<string, ActivitySnapshot> {
  const platform = usePlatform();
  const source = bridge ?? platform.activities;
  const [activities, setActivities] = useState<ReadonlyMap<string, ActivitySnapshot>>(EMPTY);

  useEffect(() => {
    if (!source) return;
    let live = true;
    const apply = (snapshot: ActivitySnapshot) =>
      setActivities((prev) => {
        const next = new Map(prev);
        next.set(activityKey(snapshot.ref), snapshot);
        return next;
      });
    // Subscribe first so nothing between list() and subscribe() is lost.
    const unsubscribe = source.subscribe((snapshot) => {
      if (live) apply(snapshot);
    });
    source
      .list()
      .then((list) => {
        if (!live) return;
        setActivities((prev) => {
          const next = new Map(list.map((s) => [activityKey(s.ref), s] as const));
          // Updates that arrived while listing are newer than the list.
          for (const [k, v] of prev) next.set(k, v);
          return next;
        });
      })
      .catch((error: unknown) => console.error('[Hudson] activity list failed:', error));
    return () => {
      live = false;
      unsubscribe();
    };
  }, [source]);

  return source ? activities : EMPTY;
}

/** One activity's state, or null if the host doesn't report it. */
export function useActivity(ref: ActivityRef | null, bridge?: PlatformActivityBridge): ActivitySnapshot | null {
  const activities = useActivities(bridge);
  const key = ref ? activityKey(ref) : null;
  return useMemo(() => (key ? activities.get(key) ?? null : null), [activities, key]);
}
