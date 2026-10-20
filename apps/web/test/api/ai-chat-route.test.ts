import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStreamUI } = vi.hoisted(() => ({
  mockStreamUI: vi.fn(),
}));

vi.mock('@hudsonkit/ai/pi-ai', () => ({
  createPiAiBackend: () => ({ streamUI: mockStreamUI }),
}));

vi.mock('@/app/api/ai/chat/cli', () => ({
  streamFromCLI: vi.fn(),
}));

vi.mock('@/app/api/ai/providers', () => ({
  DEFAULT_MODELS: { anthropic: 'claude-sonnet-4-6' },
  loadCredentials: vi.fn(() => ({ anthropic: 'test-key' })),
}));

vi.mock('@/app/api/ai/toolsets', () => ({
  loadToolset: vi.fn(() => ({ system: 'test', tools: {} })),
}));

import { POST } from '@/app/api/ai/chat/route';

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3500/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [],
      toolset: 'workspace',
      mode: 'api',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      ...body,
    }),
  });
}

describe('AI chat reasoning effort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamUI.mockReturnValue(new Response('ok'));
  });

  it.each(['off', 'low', 'medium', 'high'] as const)(
    'forwards allow-listed effort %s to the backend',
    async (effort) => {
      const response = await POST(request({ effort }));

      expect(response.status).toBe(200);
      expect(mockStreamUI).toHaveBeenCalledWith(expect.objectContaining({ effort }));
    },
  );

  it('rejects an unsupported effort before backend dispatch', async () => {
    const response = await POST(request({ effort: 'unbounded' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid reasoning effort. Expected off, low, medium, or high.',
    });
    expect(mockStreamUI).not.toHaveBeenCalled();
  });

  it('runs app declarations through the host adapter with request-scoped credentials', async () => {
    const response = await POST(request({
      mode: 'cli',
      credentials: { anthropic: 'visitor-key' },
      appToolset: { system: 'SFX app', tools: {
        compose_sound: { description: 'Compose', inputSchema: { type: 'object' } },
      } },
    }));
    expect(response.status).toBe(200);
    const options = mockStreamUI.mock.calls[0][0];
    expect(options.loadCredentials()).toEqual({ anthropic: 'visitor-key' });
    const toolset = options.loadToolset();
    expect(toolset.system).toBe('SFX app');
    expect(await toolset.tools.compose_sound.execute({})).toEqual({ applied: true });
    await POST(request({}));
    expect(mockStreamUI.mock.calls[1][0].loadCredentials()).toEqual({ anthropic: 'test-key' });
  });

  it('rejects malformed app tools before provider dispatch', async () => {
    const response = await POST(request({ appToolset: { system: 'SFX', tools: { compose_sound: {} } } }));
    expect(response.status).toBe(400);
    expect(mockStreamUI).not.toHaveBeenCalled();
  });
});
