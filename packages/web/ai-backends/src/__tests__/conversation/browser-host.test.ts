import { describe, expect, it } from 'vitest';
import {
  startBrowserConversation,
  startWebRTCEventHost,
  type AudioContextLike,
} from '../../conversation/samples/browser-host';
import { createToolDispatcher } from '../../conversation/dispatcher';
import type { ConversationEvent, ConversationSession, ToolResult } from '../../conversation/types';
import { flush } from './support';

// ---------------------------------------------------------------------------
// Fakes: a scripted session and a minimal AudioContext so host lifecycle is
// exercised without a browser.
// ---------------------------------------------------------------------------

class FakeSession implements ConversationSession {
  sentAudio: Uint8Array[] = [];
  toolResults: ToolResult[] = [];
  closedCount = 0;
  finished = false;
  generation = 0;
  failToolSends = false;
  private queue: ConversationEvent[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<ConversationEvent>) => void;
    reject: (error: Error) => void;
  }> = [];
  private done = false;
  private failure: Error | null = null;

  emit(event: ConversationEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value: event, done: false });
    else this.queue.push(event);
  }

  fail(error: Error): void {
    this.failure = error;
    this.done = true;
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters = [];
  }

  get events(): AsyncIterable<ConversationEvent> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<ConversationEvent>> => {
          const queued = this.queue.shift();
          if (queued) return Promise.resolve({ value: queued, done: false });
          if (this.done) {
            if (this.failure) return Promise.reject(this.failure);
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
        },
      }),
    };
  }

  async sendAudio(chunk: Uint8Array): Promise<void> {
    this.sentAudio.push(chunk);
  }
  async finishAudio(): Promise<void> {
    this.finished = true;
  }
  async appendInstruction(): Promise<void> {}
  interruptPlayback(): number {
    this.generation += 1;
    return this.generation;
  }
  async sendToolResult(result: ToolResult): Promise<void> {
    if (this.failToolSends) throw new Error('send failed');
    this.toolResults.push(result);
  }
  async close(): Promise<void> {
    this.closedCount += 1;
    this.done = true;
    for (const waiter of this.waiters) waiter.resolve({ value: undefined, done: true });
    this.waiters = [];
  }
}

interface FakeNode {
  started: boolean;
  stopped: boolean;
}

function fakeContext(): AudioContextLike & { closed: boolean; captureReleased: boolean; nodes: FakeNode[] } {
  const nodes: FakeNode[] = [];
  return {
    sampleRate: 48_000,
    currentTime: 0,
    destination: {},
    closed: false,
    nodes,
    async resume() {},
    async close() {
      this.closed = true;
    },
    captureReleased: false,
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createScriptProcessor() {
      return {
        onaudioprocess: null,
        connect() {},
        disconnect: () => {
          this.captureReleased = true;
        },
      };
    },
    createBuffer: (_channels, frames, sampleRate) => ({
      duration: frames / sampleRate,
      getChannelData: () => new Float32Array(frames),
    }),
    createBufferSource() {
      const node = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        started: false,
        stopped: false,
        connect() {},
        start() {
          node.started = true;
        },
        stop() {
          node.stopped = true;
        },
        disconnect() {},
      };
      nodes.push(node);
      return node;
    },
  };
}

const audioChunk = (frames: number, generation = 0) => ({
  type: 'assistantAudio' as const,
  chunk: {
    data: new Uint8Array(frames * 2),
    sampleRate: 24_000,
    generation,
    sequence: 1,
  },
});

async function startHost(session: FakeSession, overrides: {
  context?: ReturnType<typeof fakeContext>;
  maxQueuedSeconds?: number;
  dispatcher?: ReturnType<typeof createToolDispatcher>;
  onError?: (error: unknown) => void;
} = {}) {
  const context = overrides.context ?? fakeContext();
  const host = await startBrowserConversation({
    session,
    dispatcher: overrides.dispatcher,
    microphone: { stream: {} },
    inputSampleRate: 24_000,
    audioContext: context,
    maxQueuedSeconds: overrides.maxQueuedSeconds,
    onError: overrides.onError,
  });
  return { host, context };
}

describe('browser PCM host', () => {
  it('rejects a non-finite input rate before wiring anything', async () => {
    const session = new FakeSession();
    await expect(startBrowserConversation({
      session,
      microphone: { stream: {} },
      inputSampleRate: Number.NaN,
      audioContext: fakeContext(),
    })).rejects.toMatchObject({ code: 'invalid-configuration' });
  });

  it('stops scheduled playback nodes on barge-in, not just future chunks', async () => {
    const session = new FakeSession();
    const { host, context } = await startHost(session);
    session.emit(audioChunk(2_400));
    await flush();
    expect(context.nodes[0].started).toBe(true);
    host.bargeIn();
    expect(context.nodes[0].stopped).toBe(true);
    session.emit(audioChunk(2_400, 0));
    await flush();
    // Stale generation after barge-in is dropped entirely.
    expect(context.nodes).toHaveLength(1);
    await host.stop();
  });

  it('bounds the playback queue including the incoming chunk duration', async () => {
    const session = new FakeSession();
    const { host, context } = await startHost(session, { maxQueuedSeconds: 0.15 });
    session.emit(audioChunk(2_400)); // 0.1s
    session.emit(audioChunk(2_400)); // would make 0.2s queued — dropped
    await flush();
    expect(context.nodes).toHaveLength(1);
    expect(host.droppedChunks()).toBe(1);
    await host.stop();
  });

  it('stop is a single shared cleanup that survives a failing close', async () => {
    const session = new FakeSession();
    session.close = async () => {
      session.closedCount += 1;
      throw new Error('close failed');
    };
    const { host, context } = await startHost(session);
    // Both stops share one cleanup; audio is released although close threw.
    const results = await Promise.allSettled([host.stop(), host.stop()]);
    expect(session.closedCount).toBe(1);
    expect(results[0].status).toBe(results[1].status);
    // The injected context is host-owned and stays open; capture is released.
    expect(context.captureReleased).toBe(true);
    expect(context.closed).toBe(false);
  });

  it('a natural session end releases audio and cancels pending dispatch', async () => {
    const session = new FakeSession();
    let release: (() => void) | undefined;
    const dispatcher = createToolDispatcher();
    dispatcher.register('slow', async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 'late';
    });
    const { context } = await startHost(session, { dispatcher });
    session.emit({ type: 'toolCall', call: { id: 'c1', name: 'slow', args: {} } });
    await flush();
    await session.close();
    await flush();
    expect(context.captureReleased).toBe(true);
    release?.();
    await flush();
    // The late result was suppressed, not sent to the dead session.
    expect(session.toolResults).toHaveLength(0);
  });

  it('a pump failure closes the provider side and reports the error', async () => {
    const session = new FakeSession();
    const errors: unknown[] = [];
    const { context } = await startHost(session, { onError: (error) => errors.push(error) });
    session.fail(new Error('stream broke'));
    await flush();
    expect(errors).toHaveLength(1);
    expect(session.closedCount).toBeGreaterThanOrEqual(1);
    expect(context.captureReleased).toBe(true);
  });

  it('a tool-result delivery failure closes the session', async () => {
    const session = new FakeSession();
    session.failToolSends = true;
    const dispatcher = createToolDispatcher();
    dispatcher.register('lookup', async () => 'ok');
    const errors: unknown[] = [];
    await startHost(session, { dispatcher, onError: (error) => errors.push(error) });
    session.emit({ type: 'toolCall', call: { id: 'c1', name: 'lookup', args: {} } });
    await flush();
    await flush();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(session.closedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('WebRTC event host', () => {
  it('barge-in invokes the concrete remote-audio mute hook', async () => {
    const session = new FakeSession();
    let muted = 0;
    const host = startWebRTCEventHost({
      session,
      muteRemoteAudio: () => {
        muted += 1;
      },
    });
    host.bargeIn();
    expect(muted).toBe(1);
    expect(session.generation).toBe(1);
    await host.stop();
  });

  it('stop shares one cleanup and keeps playback muted when close fails', async () => {
    const session = new FakeSession();
    session.close = async () => {
      session.closedCount += 1;
      throw new Error('close failed');
    };
    let muted = 0;
    let unmuted = 0;
    const host = startWebRTCEventHost({
      session,
      muteRemoteAudio: () => {
        muted += 1;
      },
      unmuteRemoteAudio: () => {
        unmuted += 1;
      },
    });
    host.bargeIn();
    const results = await Promise.allSettled([host.stop(), host.stop()]);
    expect(session.closedCount).toBe(1);
    expect(results[0].status).toBe(results[1].status);
    // Shutdown mutes again — a closed session does not prove the element
    // pipeline is silent — and never unmutes a buffered tail.
    expect(muted).toBe(2);
    expect(unmuted).toBe(0);
    host.resumeRemoteAudio();
    expect(unmuted).toBe(0);
  });

  it('provider interruption mutes and the caller resumes explicitly', async () => {
    const session = new FakeSession();
    let muted = 0;
    let unmuted = 0;
    const host = startWebRTCEventHost({
      session,
      muteRemoteAudio: () => {
        muted += 1;
      },
      unmuteRemoteAudio: () => {
        unmuted += 1;
      },
    });
    session.emit({ type: 'interrupted', generation: 1 });
    await flush();
    expect(muted).toBe(1);
    expect(unmuted).toBe(0);
    host.resumeRemoteAudio();
    expect(unmuted).toBe(1);
    await host.stop();
    // After shutdown, resume is a no-op.
    host.resumeRemoteAudio();
    expect(unmuted).toBe(1);
  });

  it('a tool-send failure closes the session instead of degrading silently', async () => {
    const session = new FakeSession();
    session.failToolSends = true;
    const dispatcher = createToolDispatcher();
    dispatcher.register('lookup', async () => 'ok');
    const errors: unknown[] = [];
    startWebRTCEventHost({
      session,
      dispatcher,
      muteRemoteAudio: () => {},
      onError: (error) => errors.push(error),
    });
    session.emit({ type: 'toolCall', call: { id: 'c1', name: 'lookup', args: {} } });
    await flush();
    await flush();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(session.closedCount).toBeGreaterThanOrEqual(1);
  });
});


describe('immediate terminal playback cleanup', () => {
  it('PCM stops scheduled speech before provider close acknowledges', async () => {
    const session = new FakeSession();
    const finish = session.close.bind(session);
    let acknowledge!: () => void;
    session.close = async () => {
      await new Promise<void>((resolve) => { acknowledge = resolve; });
      await finish();
    };
    const { host, context } = await startHost(session);
    session.emit(audioChunk(2_400));
    await flush();
    const closing = host.stop();
    await flush();
    expect(context.nodes[0].stopped).toBe(true);
    expect(context.captureReleased).toBe(true);
    acknowledge();
    await closing;
  });

  it('WebRTC mutes before close acknowledgement and on natural stream completion', async () => {
    const session = new FakeSession();
    const finish = session.close.bind(session);
    let acknowledge!: () => void;
    session.close = async () => {
      await new Promise<void>((resolve) => { acknowledge = resolve; });
      await finish();
    };
    let muted = 0;
    const host = startWebRTCEventHost({ session, muteRemoteAudio: () => { muted++; } });
    const closing = host.stop();
    expect(muted).toBe(1);
    acknowledge();
    await closing;
    await flush();
    expect(muted).toBe(1);

    const naturalSession = new FakeSession();
    let naturalMuted = false;
    startWebRTCEventHost({ session: naturalSession, muteRemoteAudio: () => { naturalMuted = true; } });
    await naturalSession.close();
    await flush();
    expect(naturalMuted).toBe(true);
  });
});
