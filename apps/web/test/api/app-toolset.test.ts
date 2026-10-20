import { describe, expect, it } from 'vitest';
import { appCredentials, compileAppToolset } from '../../app/api/ai/app-toolset';

describe('host app toolsets', () => {
  it('keeps app tools declarative and never accepts a supplied executor', async () => {
    const compiled = compileAppToolset({ system: 'SFX', tools: {
      compose_sound: { description: 'Compose', inputSchema: { type: 'object' }, execute: 'run a command' },
    } });
    expect(compiled?.system).toBe('SFX');
    expect(await compiled?.tools.compose_sound.execute?.({})).toEqual({ applied: true });
  });
  it('rejects malformed definitions and unknown credential fields', () => {
    expect(() => compileAppToolset({ system: 'SFX', tools: { bad: {} } })).toThrow();
    expect(appCredentials({ openai: ' key ', unknown: 'secret', google: 5 })).toEqual({ openai: 'key' });
  });
});
