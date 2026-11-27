import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import {
  usePersistentState,
  useDebouncedPersistentState,
} from '../src/hooks/usePersistentState';
import { InstanceProvider } from '../src/context/InstanceContext';

/** Reads and parses a raw stored value, or undefined when absent. */
function readRaw(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
}

function seed(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

beforeEach(() => {
  localStorage.clear();
});

describe('usePersistentState — hydration', () => {
  it('returns the stored value on the first hydrated render (no initial-value flash)', () => {
    seed('hydrate.key', 'stored');
    const { result } = renderHook(() => usePersistentState('hydrate.key', 'initial'));
    expect(result.current[0]).toBe('stored');
  });

  it('falls back to the initial value when nothing is stored, then persists it', () => {
    const { result } = renderHook(() => usePersistentState('empty.key', 'initial'));
    expect(result.current[0]).toBe('initial');
    expect(readRaw('empty.key')).toBe('initial');
  });

  it('persists updates and announces them via hudson:saved', () => {
    const savedKeys: string[] = [];
    const onSaved = (e: Event) => savedKeys.push((e as CustomEvent<{ key: string }>).detail.key);
    window.addEventListener('hudson:saved', onSaved);
    try {
      const { result } = renderHook(() => usePersistentState('update.key', 0));
      act(() => result.current[1](42));
      expect(result.current[0]).toBe(42);
      expect(readRaw('update.key')).toBe(42);
      expect(savedKeys).toContain('update.key');
    } finally {
      window.removeEventListener('hudson:saved', onSaved);
    }
  });

  it('keeps the stored value under StrictMode (no initial-value write-back)', () => {
    seed('strict.key', { provider: 'openai' });
    const { result } = renderHook(
      () => usePersistentState('strict.key', { provider: 'copilot' }),
      { wrapper: StrictMode },
    );
    expect(result.current[0]).toEqual({ provider: 'openai' });
    expect(readRaw('strict.key')).toEqual({ provider: 'openai' });
  });

  it('ignores corrupt stored JSON and uses the initial value', () => {
    localStorage.setItem('corrupt.key', '{not valid json');
    const { result } = renderHook(() => usePersistentState('corrupt.key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});

describe('usePersistentState — same-tab sync', () => {
  it('adopts a value written by another instance of the same key', () => {
    const a = renderHook(() => usePersistentState('shared.key', { provider: 'copilot' }));
    const b = renderHook(() => usePersistentState('shared.key', { provider: 'copilot' }));
    act(() => a.result.current[1]({ provider: 'openai' }));
    expect(b.result.current[0]).toEqual({ provider: 'openai' });
    expect(readRaw('shared.key')).toEqual({ provider: 'openai' });
  });

  it('keeps the latest write when the other instance updates next', () => {
    const a = renderHook(() => usePersistentState('shared2.key', 1));
    const b = renderHook(() => usePersistentState('shared2.key', 1));
    act(() => a.result.current[1](2));
    act(() => b.result.current[1](prev => prev + 1));
    expect(a.result.current[0]).toBe(3);
    expect(readRaw('shared2.key')).toBe(3);
  });

  it('ignores writes to other keys', () => {
    const a = renderHook(() => usePersistentState('one.key', 'a'));
    const b = renderHook(() => usePersistentState('two.key', 'b'));
    act(() => a.result.current[1]('changed'));
    expect(b.result.current[0]).toBe('b');
  });
});

describe('usePersistentState — key scoping', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <InstanceProvider instanceId="notes-1" appId="notes">
      {children}
    </InstanceProvider>
  );

  it('prefixes keys with inst:{instanceId}: inside an InstanceProvider', () => {
    const { result } = renderHook(() => usePersistentState('draft', 'x'), { wrapper });
    act(() => result.current[1]('hello'));
    expect(readRaw('inst:notes-1:draft')).toBe('hello');
    expect(readRaw('draft')).toBeUndefined();
  });

  it('restores from the scoped key inside an InstanceProvider', () => {
    seed('inst:notes-1:draft', 'scoped-value');
    seed('draft', 'global-value');
    const { result } = renderHook(() => usePersistentState('draft', 'x'), { wrapper });
    expect(result.current[0]).toBe('scoped-value');
  });

  it('leaves keys already prefixed with inst: unscoped', () => {
    const { result } = renderHook(
      () => usePersistentState('inst:other:draft', 'x'),
      { wrapper },
    );
    act(() => result.current[1]('kept'));
    expect(readRaw('inst:other:draft')).toBe('kept');
    expect(readRaw('inst:notes-1:inst:other:draft')).toBeUndefined();
  });

  it('leaves workspace-wide hudson.ws. keys unscoped', () => {
    const { result } = renderHook(
      () => usePersistentState('hudson.ws.demo.leftW', 260),
      { wrapper },
    );
    act(() => result.current[1](300));
    expect(readRaw('hudson.ws.demo.leftW')).toBe(300);
    expect(readRaw('inst:notes-1:hudson.ws.demo.leftW')).toBeUndefined();
  });

  it('does not scope keys outside an InstanceProvider', () => {
    const { result } = renderHook(() => usePersistentState('plain', 1));
    act(() => result.current[1](2));
    expect(readRaw('plain')).toBe(2);
  });
});

describe('usePersistentState — enabled gate', () => {
  it('neither restores nor writes while enabled is false', () => {
    seed('gated.key', 'stored');
    const { result } = renderHook(() =>
      usePersistentState('gated.key', 'initial', { enabled: false }),
    );
    expect(result.current[0]).toBe('initial');

    act(() => result.current[1]('changed'));
    expect(result.current[0]).toBe('changed');
    expect(readRaw('gated.key')).toBe('stored'); // untouched
  });

  it('restores once and starts persisting when enabled flips to true', () => {
    seed('gated.flip', 'stored');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePersistentState('gated.flip', 'initial', { enabled }),
      { initialProps: { enabled: false } },
    );
    expect(result.current[0]).toBe('initial');

    rerender({ enabled: true });
    expect(result.current[0]).toBe('stored');

    act(() => result.current[1]('persisted'));
    expect(readRaw('gated.flip')).toBe('persisted');
  });
});

describe('usePersistentState — versioning and migration', () => {
  it('treats a plain stored value as version 0 and migrates it into an envelope', () => {
    seed('ver.key', 5); // legacy plain value
    const migrate = vi.fn((stored: unknown, fromVersion: number) => {
      expect(fromVersion).toBe(0);
      return (stored as number) * 10;
    });
    const { result } = renderHook(() =>
      usePersistentState<number>('ver.key', 0, { version: 1, migrate }),
    );
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(50);
    // Write-back is the new envelope format
    expect(readRaw('ver.key')).toEqual({ __v: 1, value: 50 });
  });

  it('migrates from an older envelope version', () => {
    seed('ver.env', { __v: 1, value: { name: 'a' } });
    const { result } = renderHook(() =>
      usePersistentState('ver.env', { name: '', tag: 'default' }, {
        version: 2,
        migrate: (stored, fromVersion) => ({
          ...(stored as { name: string }),
          tag: `migrated-from-${fromVersion}`,
        }),
      }),
    );
    expect(result.current[0]).toEqual({ name: 'a', tag: 'migrated-from-1' });
    expect(readRaw('ver.env')).toEqual({
      __v: 2,
      value: { name: 'a', tag: 'migrated-from-1' },
    });
  });

  it('does not call migrate when the stored version matches', () => {
    seed('ver.same', { __v: 2, value: 'kept' });
    const migrate = vi.fn();
    const { result } = renderHook(() =>
      usePersistentState('ver.same', 'initial', { version: 2, migrate }),
    );
    expect(migrate).not.toHaveBeenCalled();
    expect(result.current[0]).toBe('kept');
  });

  it('discards mismatched stored values when no migrate is provided', () => {
    seed('ver.nomigrate', 'old-shape');
    const { result } = renderHook(() =>
      usePersistentState('ver.nomigrate', 'initial', { version: 3 }),
    );
    expect(result.current[0]).toBe('initial');
    expect(readRaw('ver.nomigrate')).toEqual({ __v: 3, value: 'initial' });
  });

  it('falls back to the initial value when migrate throws', () => {
    seed('ver.throws', 1);
    const { result } = renderHook(() =>
      usePersistentState('ver.throws', 99, {
        version: 1,
        migrate: () => {
          throw new Error('bad migration');
        },
      }),
    );
    expect(result.current[0]).toBe(99);
  });

  it('keeps the legacy plain format when no version is passed (backward compatible)', () => {
    const { result } = renderHook(() => usePersistentState('plain.fmt', 'a'));
    act(() => result.current[1]('b'));
    expect(localStorage.getItem('plain.fmt')).toBe(JSON.stringify('b'));
  });
});

describe('usePersistentState — storage failures', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    }
  });

  it('degrades to plain useState when the localStorage getter throws (cross-origin iframe)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: cross-origin');
      },
    });

    const { result } = renderHook(() => usePersistentState('sec.key', 'initial'));
    expect(result.current[0]).toBe('initial');
    act(() => result.current[1]('in-memory'));
    expect(result.current[0]).toBe('in-memory');
  });

  it('degrades gracefully when setItem throws (quota exceeded)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
        key: () => null,
        length: 0,
      },
    });

    const { result } = renderHook(() => usePersistentState('quota.key', 'initial'));
    act(() => result.current[1]('still-works'));
    expect(result.current[0]).toBe('still-works');
  });
});

describe('useDebouncedPersistentState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces writes and honors the enabled gate', () => {
    const { result } = renderHook(() =>
      useDebouncedPersistentState('deb.key', 0, 200),
    );
    act(() => result.current[1](7));
    expect(readRaw('deb.key')).toBeUndefined(); // not yet flushed
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(readRaw('deb.key')).toBe(7);

    const gated = renderHook(() =>
      useDebouncedPersistentState('deb.gated', 0, 200, { enabled: false }),
    );
    act(() => gated.result.current[1](9));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(readRaw('deb.gated')).toBeUndefined();
  });

  it('flushes the latest value on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useDebouncedPersistentState('deb.flush', 0, 10_000),
    );
    act(() => result.current[1](123));
    unmount();
    expect(readRaw('deb.flush')).toBe(123);
  });
});
