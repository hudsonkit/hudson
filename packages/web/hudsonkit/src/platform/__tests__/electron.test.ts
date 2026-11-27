import { describe, expect, test } from 'bun:test';
import { ELECTRON_ADAPTER, ELECTRON_NO_DRAG_PROPS } from '../electron';

describe('Electron platform adapter', () => {
  test('supplies native title-bar defaults and interactive opt-out', () => {
    expect(ELECTRON_ADAPTER.titleBarInset).toBe(28);
    expect(ELECTRON_ADAPTER.isSSR).toBe(false);
    expect(JSON.stringify(ELECTRON_ADAPTER.dragRegionProps.style)).toBe('{"WebkitAppRegion":"drag"}');
    expect(JSON.stringify(ELECTRON_NO_DRAG_PROPS.style)).toBe('{"WebkitAppRegion":"no-drag"}');
  });
});
