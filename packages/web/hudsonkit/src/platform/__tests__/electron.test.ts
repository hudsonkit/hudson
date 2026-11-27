import { describe, expect, test } from 'bun:test';
import { ELECTRON_ADAPTER, ELECTRON_NO_DRAG_PROPS, createElectronAdapter } from '../electron';

describe('Electron platform adapter', () => {
  test('supplies native title-bar defaults and interactive opt-out', () => {
    expect(ELECTRON_ADAPTER.titleBarInset).toBe(28);
    expect(ELECTRON_ADAPTER.isSSR).toBe(false);
    expect(JSON.stringify(ELECTRON_ADAPTER.dragRegionProps.style)).toBe('{"WebkitAppRegion":"drag"}');
    expect(JSON.stringify(ELECTRON_NO_DRAG_PROPS.style)).toBe('{"WebkitAppRegion":"no-drag"}');
  });
  test('passes host command subscription through and declares guest hosting', () => {
    let listener: ((command: string) => void) | undefined;
    const commands = { subscribe: (callback: (command: string) => void) => { listener = callback; return () => { listener = undefined; }; } };
    const adapter = createElectronAdapter(commands, { kind: 'electron-webview', persistentPartitions: true });
    expect(createElectronAdapter().guestHosting).toBeUndefined();
    const received: string[] = [];
    const off = adapter.commands!.subscribe(command => received.push(command));
    listener?.('open'); off();
    expect(received).toEqual(['open']);
    expect(listener).toBeUndefined();
    expect(adapter.guestHosting).toEqual({ kind: 'electron-webview', persistentPartitions: true });
  });
});
