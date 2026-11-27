// @vitest-environment node
// Server-side connector code: jsdom would trip the browser credential guard.
import { describe, expect, it } from 'vitest';
import { connectGeminiLive, validateGeminiLiveConfig } from '../../conversation/gemini-live';
import { ConversationError, type ConversationConfig } from '../../conversation/types';
import { FakeSocket, eventReader, flush } from './support';

const config = (overrides: Partial<ConversationConfig> = {}): ConversationConfig => ({
  provider: 'gemini-live-conversation',
  model: 'gemini-3.8-live',
  instructions: 'Be brief.',
  voice: 'Kore',
  inputSampleRate: 16_000,
  ...overrides,
});

async function connect(options: {
  socket?: FakeSocket;
  configOverrides?: Partial<ConversationConfig>;
  tools?: Parameters<typeof connectGeminiLive>[0]['tools'];
  credential?: Parameters<typeof connectGeminiLive>[0]['credential'];
  browserEnvironment?: boolean;
  urls?: string[];
} = {}) {
  const socket = options.socket ?? new FakeSocket();
  const opening = connectGeminiLive({
    config: config(options.configOverrides),
    credential: options.credential ?? { kind: 'ephemeralToken', token: 'ephemeral-token' },
    tools: options.tools,
    browserEnvironment: options.browserEnvironment ?? false,
    socketFactory: (url) => {
      options.urls?.push(url);
      return socket;
    },
  });
  await flush();
  socket.push({ setupComplete: {} });
  const session = await opening;
  return { socket, session };
}

describe('Gemini Live web client', () => {
  it('declares model, audio modality, transcripts, and explicit tool behavior', async () => {
    const { socket, session } = await connect({
      tools: [
        { name: 'lights_on', behavior: 'nonBlocking' },
        { name: 'lights_off', behavior: 'blocking' },
      ],
    });
    const setup = socket.sent[0].setup as Record<string, unknown>;
    expect(setup.model).toBe('models/gemini-3.8-live');
    const generation = setup.generationConfig as Record<string, unknown>;
    expect(generation.responseModalities).toEqual(['AUDIO']);
    expect(generation.thinkingConfig).toBeUndefined();
    expect(setup.inputAudioTranscription).toEqual({});
    expect(setup.outputAudioTranscription).toEqual({});
    const declarations = (setup.tools as Array<Record<string, unknown>>)[0]
      .functionDeclarations as Array<Record<string, unknown>>;
    expect(declarations.find((d) => d.name === 'lights_on')?.behavior).toBe('NON_BLOCKING');
    expect(declarations.find((d) => d.name === 'lights_off')?.behavior).toBe('BLOCKING');
    const reader = eventReader(session);
    expect(await reader.next()).toEqual({ type: 'ready' });
  });

  it('enforces model rules instead of dropping configuration', () => {
    expect(validateGeminiLiveConfig(config({ thinkingLevel: 'low' }), [])).toContain('thinking level');
    expect(validateGeminiLiveConfig(
      config({ model: 'gemini-3.8-live-extended-thinking' }),
      [{ name: 'x', behavior: 'blocking' }],
    )).toContain('non-blocking');
    expect(validateGeminiLiveConfig(config({ inputSampleRate: 44_100 }), [])).toContain('16000');
    expect(validateGeminiLiveConfig(config({ model: ' ' }), [])).toContain('model');
    expect(validateGeminiLiveConfig(
      config({ model: 'gemini-3.8-live-extended-thinking', thinkingLevel: 'high' }), [],
    )).toBeNull();
  });

  it('keeps long-lived keys out of browsers and out of URLs', async () => {
    await expect(connectGeminiLive({
      config: config(),
      credential: { kind: 'apiKey', apiKey: 'secret' },
      browserEnvironment: true,
      socketFactory: () => new FakeSocket(),
    })).rejects.toMatchObject({ code: 'credential-boundary' });

    const urls: string[] = [];
    const inits: Array<Record<string, string> | undefined> = [];
    const socket = new FakeSocket();
    const opening = connectGeminiLive({
      config: config(),
      credential: { kind: 'apiKey', apiKey: 'server-secret' },
      browserEnvironment: false,
      socketFactory: (url, init) => {
        urls.push(url);
        inits.push(init?.headers);
        return socket;
      },
    });
    await flush();
    socket.push({ setupComplete: {} });
    await opening;
    expect(urls[0]).toContain('BidiGenerateContent');
    expect(urls[0]).not.toContain('server-secret');
    expect(inits[0]).toEqual({ 'x-goog-api-key': 'server-secret' });
  });

  it('uses the constrained endpoint with the access_token parameter for ephemeral tokens', async () => {
    const urls: string[] = [];
    await connect({ urls });
    expect(urls[0]).toContain('BidiGenerateContentConstrained');
    expect(urls[0]).toContain('access_token=ephemeral-token');
  });

  it('sends PCM frames at the configured rate and rejects malformed chunks', async () => {
    const { socket, session } = await connect();
    await session.sendAudio(new Uint8Array([1, 2]));
    await session.finishAudio();
    const audio = (socket.sent[1].realtimeInput as Record<string, unknown>).audio as Record<string, unknown>;
    expect(audio.mimeType).toBe('audio/pcm;rate=16000');
    expect((socket.sent[2].realtimeInput as Record<string, unknown>).audioStreamEnd).toBe(true);
    await expect(session.sendAudio(new Uint8Array([1]))).rejects.toMatchObject({ code: 'invalid-audio-chunk' });
  });

  it('honors barge-in generations and keeps reading after turnComplete', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    socket.push({ serverContent: { modelTurn: { parts: [
      { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } },
    ] } } });
    const first = await reader.next();
    if (first.type !== 'assistantAudio') throw new Error('expected audio');
    expect(first.chunk.sampleRate).toBe(24_000);
    expect(first.chunk.generation).toBe(0);
    socket.push({ serverContent: { interrupted: true } });
    expect(await reader.next()).toEqual({ type: 'interrupted', generation: 1 });
    socket.push({ serverContent: { turnComplete: true, interactionStatus: 'IN_PROGRESS' } });
    expect(await reader.next()).toEqual({ type: 'interactionStatus', status: 'inProgress' });
    expect(await reader.next()).toEqual({ type: 'turnComplete' });
    socket.push({ interactionStatus: 'IDLE' });
    expect(await reader.next()).toEqual({ type: 'interactionStatus', status: 'idle' });
    socket.push({ toolCall: { functionCalls: [{ id: 'f1', name: 'lights_on', args: {} }] } });
    const call = await reader.next();
    expect(call).toEqual({ type: 'toolCall', call: { id: 'f1', name: 'lights_on', args: {} } });
  });

  it('preserves invalid tool arguments for dispatcher rejection', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    socket.push({ toolCall: { functionCalls: [
      { id: 'f1', name: 'lights_on', args: 'not-an-object' },
      { id: 'f2', name: 'lights_on' },
    ] } });
    const invalid = await reader.next();
    if (invalid.type !== 'toolCall') throw new Error('expected call');
    expect(invalid.call.args).toBe('not-an-object');
    const zeroArg = await reader.next();
    if (zeroArg.type !== 'toolCall') throw new Error('expected call');
    expect(zeroArg.call.args).toEqual({});
  });

  it('serializes scheduling on base, refuses it on extended thinking, and rejects unknown results', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    socket.push({ toolCall: { functionCalls: [{ id: 'f1', name: 'lights_on', args: {} }] } });
    await reader.next();
    await session.sendToolResult({
      callId: 'f1', name: 'lights_on', output: { ok: true, value: { result: 'ok' } }, scheduling: 'interrupt',
    });
    const response = ((socket.sent[1].toolResponse as Record<string, unknown>)
      .functionResponses as Array<Record<string, unknown>>)[0];
    expect(response.id).toBe('f1');
    expect(response.response).toEqual({ result: 'ok', scheduling: 'INTERRUPT' });
    await expect(session.sendToolResult({
      callId: 'f9', name: 'lights_on', output: { ok: true, value: {} },
    })).rejects.toMatchObject({ code: 'unknown-tool-call' });

    const extendedSocket = new FakeSocket();
    const { session: extended } = await connect({
      socket: extendedSocket,
      configOverrides: { model: 'gemini-3.8-live-extended-thinking', thinkingLevel: 'low' },
    });
    const extendedReader = eventReader(extended);
    await extendedReader.next();
    extendedSocket.push({ toolCall: { functionCalls: [{ id: 'f2', name: 'lookup', args: {} }] } });
    await extendedReader.next();
    await expect(extended.sendToolResult({
      callId: 'f2', name: 'lookup', output: { ok: true, value: {} }, scheduling: 'silent',
    })).rejects.toMatchObject({ code: 'invalid-configuration' });
    // The invalid result did not consume the pending call.
    await extended.sendToolResult({ callId: 'f2', name: 'lookup', output: { ok: true, value: {} } });
  });

  it('drops repeated call announcements and results for cancelled calls', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    socket.push({ toolCall: { functionCalls: [{ id: 'f1', name: 'lights_on', args: {} }] } });
    await reader.next();
    socket.push({ toolCallCancellation: { ids: ['f1'] } });
    expect(await reader.next()).toEqual({ type: 'toolCallsCancelled', ids: ['f1'] });
    await expect(session.sendToolResult({
      callId: 'f1', name: 'lights_on', output: { ok: true, value: {} },
    })).rejects.toMatchObject({ code: 'unknown-tool-call' });
    socket.push({ toolCall: { functionCalls: [{ id: 'f1', name: 'lights_on', args: {} }] } });
    socket.push({ serverContent: { turnComplete: true } });
    // The repeated announcement produced no second toolCall event.
    expect(await reader.next()).toEqual({ type: 'turnComplete' });
  });

  it('decodes binary and blob frames in arrival order', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    const blobLike = {
      text: async () => JSON.stringify({ serverContent: { inputTranscription: { text: 'first' } } }),
    };
    socket.emit('message', { data: blobLike });
    socket.emit('message', {
      data: new TextEncoder().encode(
        JSON.stringify({ serverContent: { inputTranscription: { text: 'second' } } }),
      ).buffer,
    });
    expect(await reader.next()).toEqual({ type: 'userTranscriptDelta', text: 'first' });
    expect(await reader.next()).toEqual({ type: 'userTranscriptDelta', text: 'second' });
  });

  it('ends the stream with fixed copy on goAway and provider errors', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    socket.push({ goAway: {} });
    const failure = await reader.failure();
    expect(failure).toBeInstanceOf(ConversationError);
    expect((failure as ConversationError).message).toBe('The provider is ending the session.');
  });

  it('closes with one terminal event and times out setup within its bound', async () => {
    const { socket, session } = await connect();
    const reader = eventReader(session);
    await reader.next(); // ready
    await Promise.all([session.close(), session.close()]);
    expect(await reader.next()).toEqual({ type: 'closed' });
    expect(await reader.ended()).toBe(true);
    expect(socket.closed).toBe(true);

    const silent = new FakeSocket();
    await expect(connectGeminiLive({
      config: config(),
      credential: { kind: 'ephemeralToken', token: 't' },
      browserEnvironment: false,
      socketFactory: () => silent,
      setupTimeoutMs: 30,
    })).rejects.toMatchObject({ code: 'setup-rejected' });
  });

  it('supports cancelling a pending open with an AbortSignal', async () => {
    const controller = new AbortController();
    const silent = new FakeSocket();
    const opening = connectGeminiLive({
      config: config(),
      credential: { kind: 'ephemeralToken', token: 't' },
      browserEnvironment: false,
      socketFactory: () => silent,
      signal: controller.signal,
    });
    await flush();
    controller.abort();
    await expect(opening).rejects.toMatchObject({ code: 'cancelled' });
    expect(silent.closed).toBe(true);
  });
});
