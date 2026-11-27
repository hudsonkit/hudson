// @vitest-environment node
// Server-side connector code: jsdom would trip the browser credential guard.
import { describe, expect, it } from 'vitest';
import { EventChannel } from '../../conversation/channel';
import {
  createConversationModelCatalog,
  fetchGPTLiveModels,
  fetchGeminiLiveModels,
} from '../../conversation/models';
import { createGPTLiveWebRTCSession, mintGeminiEphemeralToken } from '../../conversation/broker';
import { createGPTLiveSessionRoute, createGeminiTokenRoute } from '../../conversation/samples/server-routes';
import {
  sampleGPTLiveSettings,
  sampleGeminiExtendedThinkingSettings,
  sampleGeminiLiveSettings,
  validateConversationSettings,
} from '../../conversation/samples/settings';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('event channel bounds', () => {
  it('evicts stale audio under backpressure but fails on control-event loss', () => {
    const channel = new EventChannel(1);
    expect(channel.push({
      type: 'assistantAudio',
      chunk: { data: new Uint8Array([0, 0]), sampleRate: 24_000, generation: 0, sequence: 1 },
    })).toBe(true);
    expect(channel.push({ type: 'turnComplete' })).toBe(true);
    expect(channel.push({ type: 'turnComplete' })).toBe(false);
  });
});

describe('model catalogs', () => {
  it('preserves unknown saved models and keeps the catalog on failed refresh', async () => {
    let failing = false;
    const catalog = createConversationModelCatalog({
      provider: 'gemini-live-conversation',
      fetchModels: async () => {
        if (failing) throw new Error('down');
        return [{
          provider: 'gemini-live-conversation', id: 'gemini-3.8-live', displayName: 'Gemini 3.8 Live',
          toolCalling: 'supported', configurableThinking: 'unsupported', discovered: true,
        }];
      },
    });
    await catalog.refresh();
    const entries = catalog.entries('gemini-3.7-live-retired');
    expect(entries).toHaveLength(2);
    expect(entries[1].available).toBe(false);
    expect(entries[1].model.discovered).toBe(false);
    failing = true;
    await expect(catalog.refresh()).rejects.toThrow();
    expect(catalog.entries()).toHaveLength(1);
  });

  it('follows Gemini pagination, scopes capabilities, and fails malformed pages', async () => {
    const urls: string[] = [];
    const models = await fetchGeminiLiveModels({
      apiKey: 'k',
      fetchImpl: (async (url: string) => {
        urls.push(url);
        if (!url.includes('pageToken')) {
          return jsonResponse({
            models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }],
            nextPageToken: 'page2',
          });
        }
        return jsonResponse({ models: [
          { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
          { name: 'models/gemini-next-live-preview', supportedGenerationMethods: ['bidiGenerateContent'] },
        ] });
      }),
    });
    expect(urls).toHaveLength(2);
    expect(models.map((model) => model.id)).toEqual(['gemini-3.8-live', 'gemini-next-live-preview']);
    expect(models[0].toolCalling).toBe('supported');
    // Discovery alone does not establish capabilities for unfamiliar models.
    expect(models[1].toolCalling).toBe('unknown');
    expect(models[1].notes).toBeUndefined();

    await expect(fetchGeminiLiveModels({
      apiKey: 'k',
      fetchImpl: (async () => jsonResponse({ nonsense: true })),
    })).rejects.toMatchObject({ code: 'discovery-failed' });
  });

  it('filters the GPT-Live account list and fails loudly on errors', async () => {
    const models = await fetchGPTLiveModels({
      apiKey: 'sk-test',
      fetchImpl: (async (_url: string, init?: { body?: string; headers?: Record<string, string> }) => {
        expect(init?.headers?.Authorization).toBe('Bearer sk-test');
        return jsonResponse({ data: [{ id: 'gpt-live-1' }, { id: 'gpt-live-transcribe' }, { id: 'gpt-5.2' }] });
      }),
    });
    expect(models.map((model) => model.id)).toEqual(['gpt-live-1']);
    await expect(fetchGPTLiveModels({
      apiKey: 'sk-test',
      fetchImpl: (async () => jsonResponse({}, false)),
    })).rejects.toMatchObject({ code: 'discovery-failed' });
  });
});

describe('credential broker', () => {
  it('mints ephemeral tokens with server-chosen constraints', async () => {
    const holder: { sent?: Record<string, unknown> } = {};
    const grant = await mintGeminiEphemeralToken({
      apiKey: 'server-key',
      model: 'gemini-3.8-live',
      fetchImpl: (async (_url: string, init?: { body?: string; headers?: Record<string, string> }) => {
        holder.sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ name: 'auth_tokens/abc', expireTime: '2026-09-17T00:00:00Z' });
      }),
    });
    expect(grant.token).toBe('auth_tokens/abc');
    expect((holder.sent?.liveConnectConstraints as Record<string, unknown>).model).toBe('models/gemini-3.8-live');
    await expect(mintGeminiEphemeralToken({
      apiKey: 'k', fetchImpl: (async () => jsonResponse({}, false)),
    })).rejects.toMatchObject({ code: 'credential-boundary' });
  });

  it('exchanges WebRTC SDP server-side and returns only the answer', async () => {
    const answer = await createGPTLiveWebRTCSession({
      apiKey: 'server-key',
      offerSdp: 'offer',
      session: { model: 'gpt-live-1' },
      fetchImpl: (async () => jsonResponse({
        session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'answer' },
      })),
    });
    expect(answer).toEqual({ answerSdp: 'answer', sessionId: 'live_1' });
  });

  it('sample routes authenticate first and never take server decisions from the request', async () => {
    const tokenRoute = createGeminiTokenRoute({
      auth: { authenticate: (authorization) => authorization === 'valid' },
      apiKey: 'server-key',
      model: 'gemini-3.8-live',
      fetchImpl: (async () => jsonResponse({ name: 'auth_tokens/abc' })),
    });
    expect((await tokenRoute({ authorization: 'nope' })).status).toBe(401);
    const granted = await tokenRoute({
      authorization: 'valid',
      body: { model: 'attacker-chosen-model' },
    });
    expect(granted.status).toBe(200);
    expect(granted.body.token).toBe('auth_tokens/abc');

    const sessionRoute = createGPTLiveSessionRoute({
      auth: { authenticate: (authorization) => authorization === 'valid' },
      apiKey: 'server-key',
      session: { model: 'gpt-live-1' },
      fetchImpl: (async (_url: string, init?: { body?: string; headers?: Record<string, string> }) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect((body.session as Record<string, unknown>).model).toBe('gpt-live-1');
        return jsonResponse({ transport: { sdp: 'answer' } });
      }),
    });
    expect((await sessionRoute({ authorization: 'valid', body: {} })).status).toBe(400);
    const exchanged = await sessionRoute({
      authorization: 'valid',
      body: { sdp: 'offer', session: { model: 'attacker-model' } },
    });
    expect(exchanged.status).toBe(200);
  });
});

describe('sample settings', () => {
  it('validates the authored samples with the connector rules', () => {
    expect(validateConversationSettings(sampleGPTLiveSettings)).toEqual([]);
    expect(validateConversationSettings(sampleGeminiLiveSettings)).toEqual([]);
    expect(validateConversationSettings(sampleGeminiExtendedThinkingSettings)).toEqual([]);
  });

  it('rejects incompatible authored configuration with connector messages', () => {
    expect(validateConversationSettings({
      ...sampleGeminiLiveSettings, thinkingLevel: 'low',
    })).toContainEqual(expect.stringContaining('thinking level'));
    expect(validateConversationSettings({
      ...sampleGPTLiveSettings, inputSampleRate: 8_000,
    })).toContainEqual(expect.stringContaining('24000 or 16000'));
    expect(validateConversationSettings({
      ...sampleGPTLiveSettings,
      options: { delegation: '{"type":"responses","responses":{}}' },
    })).toContainEqual(expect.stringContaining('backend model'));
    expect(validateConversationSettings({
      ...sampleGeminiLiveSettings, provider: 'someone-else',
    })).toContainEqual(expect.stringContaining('Unknown conversation provider'));
  });
});
