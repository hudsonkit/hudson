import { isInternalDocPath } from './docs-policy';
import { loadToolset } from '../app/api/ai/toolsets';
import { APP_HOST, MARKETING_HOSTS, isNoIndexPath, siteRedirect } from './seo';

const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// Products vendored into site/out/<name>/ and served at /<name>.
// Directory + file paths resolve via ASSETS; anything else under the root
// is a client-side route and falls back to the product's index.html.
const PRODUCT_ROOTS = ['arc', 'studio', 'sfx'];
// Multi-page static exports: a miss is a real 404, served from the
// product's own 404.html instead of the SPA shell.
const STATIC_PRODUCTS = new Set(['sfx']);

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
}

interface ChatRequestBody {
  messages?: Array<{
    role?: string;
    content?: string;
    parts?: Array<Record<string, unknown>>;
  }>;
  toolset?: string;
  context?: Record<string, unknown>;
  mode?: string;
  provider?: string;
  model?: string;
}

type ChatMessage = NonNullable<ChatRequestBody['messages']>[number];

interface WorkerAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type UIMessageChunk =
  | { type: 'start'; messageId?: string }
  | { type: 'start-step' }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown; dynamic: true }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown; dynamic: true }
  | { type: 'finish-step' }
  | { type: 'finish'; finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' }
  | { type: 'error'; errorText: string };

function createId(prefix: string) {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return `${prefix}-${globalCrypto.randomUUID().slice(0, 8)}`;
  }
  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    globalCrypto.getRandomValues(bytes);
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${id}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractMessageText(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content;

  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text: string[] = [];

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      text.push(part.text);
    } else if (part.type === 'file') {
      const filename = typeof part.filename === 'string' ? part.filename : 'attachment';
      const mediaType = typeof part.mediaType === 'string' ? part.mediaType : 'file';
      text.push(`[Attached ${mediaType}: ${filename}]`);
    }
  }

  return text.join('\n').trim();
}

function toWorkerMessages(
  messages: ChatRequestBody['messages'] = [],
  systemPrompt: string,
): WorkerAIMessage[] {
  const workerMessages: WorkerAIMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }]
    : [];

  for (const message of messages) {
    const role = message.role === 'assistant' || message.role === 'system'
      ? message.role
      : 'user';
    const content = extractMessageText(message);
    if (!content) continue;
    workerMessages.push({ role, content });
  }

  return workerMessages;
}

function pickWorkersAIModel(model?: string) {
  return model?.startsWith('@cf/') ? model : DEFAULT_WORKERS_AI_MODEL;
}

function extractWorkersAIText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const record = result as Record<string, unknown>;
  if (typeof record.response === 'string') return record.response;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.output === 'string') return record.output;

  const nested = record.result;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.response === 'string') return nestedRecord.response;
    if (typeof nestedRecord.text === 'string') return nestedRecord.text;
  }

  return JSON.stringify(result);
}

function createUIStreamResponse(
  producer: (write: (chunk: UIMessageChunk) => void) => Promise<void>,
  init?: ResponseInit,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: UIMessageChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        await producer(write);
      } catch (error) {
        write({
          type: 'error',
          errorText: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    ...init,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
      'x-accel-buffering': 'no',
      ...init?.headers,
    },
  });
}

function removeToolMarkup(text: string) {
  return text
    .replace(/<tool\s+name="[^"]+">[\s\S]*?(?:<\/tool>|<tool>)/g, '')
    .replace(/<\/?tool[^>]*>/g, '')
    .trim();
}

function serveAppRoot(request: Request, env: Env) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host !== APP_HOST || url.pathname !== '/') {
    return null;
  }

  url.pathname = '/app/';
  return env.ASSETS.fetch(new Request(url, request));
}

function serveMarketingRoot(request: Request, env: Env) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!MARKETING_HOSTS.includes(host) || url.pathname !== '/') {
    return null;
  }

  url.pathname = '/landing/';
  return env.ASSETS.fetch(new Request(url, request));
}

async function serveProductRoute(request: Request, env: Env) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!MARKETING_HOSTS.includes(host) || request.method !== 'GET') {
    return null;
  }

  const product = PRODUCT_ROOTS.find(
    name => url.pathname === `/${name}` || url.pathname.startsWith(`/${name}/`),
  );
  if (!product) {
    return null;
  }

  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) {
    return response;
  }

  if (STATIC_PRODUCTS.has(product)) {
    // Extensionless: the assets binding redirects *.html requests.
    url.pathname = `/${product}/404`;
    const notFound = await env.ASSETS.fetch(new Request(url, request));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  }

  // A client-side route inside the product SPA — hand it the shell so
  // the router can resolve the path itself. Ask for the directory, not
  // index.html: the assets binding answers /index.html with a redirect.
  url.pathname = `/${product}/`;
  return env.ASSETS.fetch(new Request(url, request));
}

function writeAssistantResponse(
  write: (chunk: UIMessageChunk) => void,
  text: string,
) {
  write({ type: 'start', messageId: createId('msg') });
  write({ type: 'start-step' });

  const cleanText = removeToolMarkup(text) || 'The hosted demo can answer questions here, but terminal and live local actions stay in the local/native HudsonKit build.';
  const id = createId('text');
  write({ type: 'text-start', id });
  write({ type: 'text-delta', id, delta: cleanText });
  write({ type: 'text-end', id });
  write({ type: 'finish-step' });
  write({ type: 'finish', finishReason: 'stop' });
}

async function handleAIChat(request: Request, env: Env) {
  if (!env.AI) {
    return createUIStreamResponse(async write => {
      write({ type: 'start', messageId: createId('msg') });
      write({ type: 'error', errorText: 'Workers AI binding is not configured for this deployment.' });
      write({ type: 'finish', finishReason: 'error' });
    }, { status: 503 });
  }

  const body = await request.json() as ChatRequestBody;
  const toolset = body.toolset ?? 'workspace';
  const context = body.context ?? {};
  const workersModel = pickWorkersAIModel(body.model);
  const { system } = loadToolset(toolset, context);
  const deploymentNote = [
    `This HudsonKit demo is deployed on Cloudflare and answers through Workers AI model ${workersModel}.`,
    'This is managed chat only. Do not emit tool tags. Do not claim to run terminal commands, edit local files, start local services, or mutate the live workspace.',
    'If the user asks for terminal or local-service behavior, explain that terminal remains local/native-only and that hosted execution would require a sandbox backend.',
    body.mode === 'cli'
      ? 'The local CLI/PTY relay is not available in this hosted demo.'
      : '',
    body.provider && body.provider !== 'workers-ai'
      ? `The browser requested provider "${body.provider}", but this deployment is pinned to Workers AI.`
      : '',
  ].filter(Boolean).join(' ');
  const systemPrompt = [system, deploymentNote].filter(Boolean).join('\n\n---\n\n');
  const messages = toWorkerMessages(body.messages, systemPrompt);

  if (messages.length === 0) {
    return createUIStreamResponse(async write => {
      writeAssistantResponse(write, 'Send a prompt and I can help with the HudsonKit workspace.');
    });
  }

  return createUIStreamResponse(async write => {
    const result = await env.AI!.run(workersModel, {
      messages,
      max_tokens: 900,
      temperature: 0.35,
    });
    const text = extractWorkersAIText(result);
    writeAssistantResponse(
      write,
      text || 'Workers AI returned an empty response.',
    );
  });
}

function withIndexingPolicy(response: Response, url: URL): Response {
  if (url.hostname !== APP_HOST && !isNoIndexPath(url.pathname)) return response;
  const result = new Response(response.body, response);
  // Keep the stricter existing embed/preview nofollow policy if supplied.
  if (!result.headers.has('X-Robots-Tag')) {
    result.headers.set('X-Robots-Tag', /^\/(?:preview|embed)(?:\/|$)/.test(url.pathname) ? 'noindex, nofollow' : 'noindex, follow');
  }
  return result;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (isInternalDocPath(url.pathname)) {
      return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    }
    const redirect = siteRedirect(url);
    if (redirect) return Response.redirect(redirect.href, 308);

    // Public code only: visitor credentials stay inside the importing browser.
    if (url.pathname === '/ai/browser-v1.js') {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Cache-Control', 'public, max-age=300');
      return response;
    }

    // The application host has no indexable marketing inventory of its own.
    if (url.hostname === APP_HOST && url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (url.hostname === APP_HOST && url.pathname === '/sitemap.xml') {
      return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    }

    if (url.pathname === '/api/ai/health') {
      return Response.json({
        provider: 'workers-ai',
        model: DEFAULT_WORKERS_AI_MODEL,
        available: Boolean(env.AI),
      });
    }

    if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
      return handleAIChat(request, env);
    }

    const appRootResponse = serveAppRoot(request, env);
    if (appRootResponse) return withIndexingPolicy(await appRootResponse, url);

    const marketingRootResponse = serveMarketingRoot(request, env);
    if (marketingRootResponse) return marketingRootResponse;

    const productResponse = await serveProductRoute(request, env);
    if (productResponse) return productResponse;

    return withIndexingPolicy(await env.ASSETS.fetch(request), url);
  },
};
