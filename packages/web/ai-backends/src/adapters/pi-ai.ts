// ---------------------------------------------------------------------------
// pi-ai adapter — in-process dispatch via @earendil-works/pi-ai
//
// Two surfaces:
//   * stream(req): the Backend interface — yields Hudson StreamEvent.
//   * streamUI(req): returns a Next-compatible Response carrying a standard
//     UIMessageStream. Hudson's chat route uses this fast path so the client
//     hooks (useHudsonAI / useChat) see the SDK-native stream shape directly
//     (text-start/text-delta/text-end + tool-input-available/tool-output-
//     available) and we can run a multi-step tool execution loop in the
//     adapter rather than the route.
//
// Streaming-first: translates pi-ai's AssistantMessageEvent stream into
// Hudson's 8 semantic StreamEvent types. Stateless — no sessions.
// ---------------------------------------------------------------------------

import {
  stream as piAiStream,
  streamSimple as piAiStreamSimple,
  getModel,
  getEnvApiKey,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Message as PiAiMessage,
  type UserMessage,
  type AssistantMessage as PiAiAssistantMessage,
  type Tool as PiAiTool,
  type ToolCall,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai/compat';
import {
  asSchema,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  type FlexibleSchema,
} from 'ai';

import type {
  Backend,
  DispatchRequest,
  DispatchResult,
  StreamEvent,
  Message,
} from '../types';
import type { CredentialResolver } from '../credentials';
import { hudVaultResolver } from '../credentials';
import { aggregateStream } from '../dispatch';
import type { ToolsetDefinition } from '../toolsets/types';
import type { ToolsetRegistry } from '../toolsets/registry';
import { defaultRegistry } from '../toolsets/registry';

// ---------------------------------------------------------------------------
// Config + meta types
// ---------------------------------------------------------------------------

export interface PiAiConfig {
  provider: string;
  model: string;
  systemPrompt?: string;
  apiKey?: string;
}

export interface PiAiMeta {
  responseId?: string;
  responseModel?: string;
  stopReason?: string;
}

export interface PiAiBackendOptions {
  credentials?: CredentialResolver;
  registry?: ToolsetRegistry;
}

// ---------------------------------------------------------------------------
// Message conversion: Hudson Message[] → pi-ai Message[]
// ---------------------------------------------------------------------------

function toPiAiMessages(messages: Message[], input: string): PiAiMessage[] {
  const now = Date.now();
  const result: PiAiMessage[] = [];

  for (const msg of messages) {
    const text = typeof msg.content === 'string'
      ? msg.content
      : msg.content.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('');

    if (msg.role === 'user') {
      result.push({ role: 'user', content: text, timestamp: now } satisfies UserMessage);
    } else if (msg.role === 'assistant') {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: '(historical)',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: now,
      } satisfies PiAiAssistantMessage);
    }
    // system messages are handled via systemPrompt; tool messages are skipped
  }

  // Append current user input
  result.push({ role: 'user', content: input, timestamp: now } satisfies UserMessage);

  return result;
}

// ---------------------------------------------------------------------------
// Toolset → pi-ai Tool[] compilation
// ---------------------------------------------------------------------------

function compileTools(
  req: DispatchRequest<PiAiConfig>,
  registry: ToolsetRegistry,
): { tools?: PiAiTool[]; systemSuffix?: string } {
  const toolsetRef = req.toolset;
  if (!toolsetRef) return {};

  let definition: ToolsetDefinition | null = null;
  if (typeof toolsetRef === 'string') {
    definition = registry.resolve(toolsetRef);
  } else {
    definition = toolsetRef;
  }
  if (!definition) return {};

  const ctx: Record<string, unknown> = {};
  const rawTools = definition.tools(ctx);
  const systemSuffix = [definition.system, definition.context(ctx)].filter(Boolean).join('\n\n');

  const tools: PiAiTool[] = Object.entries(rawTools).map(([name, def]) => {
    const d = def as { description?: string; inputSchema?: unknown };
    return {
      name,
      description: d.description ?? '',
      parameters: (d.inputSchema ?? { type: 'object', properties: {} }) as PiAiTool['parameters'],
    };
  });

  return { tools: tools.length > 0 ? tools : undefined, systemSuffix };
}

// ---------------------------------------------------------------------------
// Event translation: pi-ai AssistantMessageEvent → Hudson StreamEvent
// ---------------------------------------------------------------------------

function* translateEvent(event: AssistantMessageEvent): Iterable<StreamEvent<PiAiMeta>> {
  switch (event.type) {
    case 'text_delta':
      yield { type: 'text', delta: event.delta };
      break;

    case 'thinking_delta':
      yield { type: 'reasoning', delta: event.delta };
      break;

    case 'toolcall_end':
      yield {
        type: 'tool_call',
        id: event.toolCall.id,
        name: event.toolCall.name,
        input: event.toolCall.arguments,
      };
      break;

    case 'done': {
      const msg = event.message;
      yield {
        type: 'usage',
        input: msg.usage.input,
        output: msg.usage.output,
        cost: msg.usage.cost.total,
      };
      yield {
        type: 'done',
        meta: {
          responseId: msg.responseId,
          responseModel: msg.responseModel,
          stopReason: msg.stopReason,
        },
      };
      break;
    }

    case 'error': {
      const err = event.error;
      yield {
        type: 'error',
        message: err.errorMessage ?? `Stream error: ${event.reason}`,
        recoverable: event.reason === 'aborted',
      };
      break;
    }

    // start, text_start, text_end, thinking_start, thinking_end, toolcall_start,
    // toolcall_delta — no Hudson StreamEvent equivalent, skip
  }
}

// ---------------------------------------------------------------------------
// streamUI() — Next-compatible UIMessageStream fast path
//
// Lifts the multi-step tool-execution loop out of the Hudson chat route so
// every consumer of the pi-ai backend gets identical loop semantics.
// ---------------------------------------------------------------------------

/** A plain JSON Schema object, as portable (AI-SDK-free) toolsets supply. */
export interface JsonSchemaInput {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Tool shape the route passes in. `inputSchema` may be a Zod / standard-schema
 * (validated + `toJSONSchema`-able) OR a plain JSON Schema object — the latter
 * is what the portable built-in toolsets (e.g. `intents`) supply.
 */
export interface HudsonTool {
  description?: string;
  inputSchema?: FlexibleSchema<unknown> | { toJSONSchema?: () => unknown } | JsonSchemaInput;
  execute?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** Minimal UI message shape the route forwards from the client. */
export interface PiAiUIMessagePart {
  type: string;
  text?: string;
}

export interface PiAiUIMessage {
  role: 'user' | 'assistant' | 'system' | string;
  parts?: PiAiUIMessagePart[];
  content?: unknown;
}

/** Compiled toolset the route loads server-side (tools + composed system). */
export interface PiAiCompiledToolset {
  tools: Record<string, HudsonTool>;
  system?: string;
}

export interface PiAiUIRequest {
  messages: PiAiUIMessage[];
  toolset: string;
  context?: Record<string, unknown>;
  provider?: string;
  model?: string;
  /**
   * Loader the route injects so the package stays free of app-side toolset
   * resolution (Zod schemas, toolPrompt composition, etc.).
   */
  loadToolset: (id: string, ctx: Record<string, unknown>) => PiAiCompiledToolset;
  /** Credential resolver injected by the route — keeps file paths out of the package. */
  loadCredentials: () => Record<string, string | undefined>;
  /**
   * Optional per-provider default model map. The route passes Hudson's
   * DEFAULT_MODELS so we resolve the same defaults the rest of the app uses.
   * If absent, the caller must supply `model`, otherwise we fall back to
   * pi-ai's own resolution via `getModel`.
   */
  defaultModels?: Record<string, string>;
  /** Max tool-call rounds. Defaults to {@link DEFAULT_MAX_STEPS}. */
  maxSteps?: number;
  /** Omit to preserve provider defaults; use 'off' to explicitly disable reasoning. */
  effort?: 'off' | 'low' | 'medium' | 'high';
}

export interface PiAiBackend extends Backend<PiAiConfig, PiAiMeta> {
  /**
   * Fast path: run a multi-step pi-ai loop and return a UIMessageStream-
   * shaped Response. Emits text-start/text-delta/text-end +
   * tool-input-available/tool-output-available events. Executes tool
   * `execute` callbacks server-side and feeds results back into pi-ai
   * until the model produces a final response (or MAX_STEPS is hit).
   */
  streamUI(req: PiAiUIRequest): Response;
}

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_PROVIDER = 'minimax';

interface PiProviderConfig {
  provider: string;
  credentialKey: string;
}

function normalizeProvider(provider?: string): PiProviderConfig {
  switch (provider) {
    case undefined:
    case '':
      return { provider: DEFAULT_PROVIDER, credentialKey: DEFAULT_PROVIDER };
    case 'copilot':
    case 'github':
    case 'github-copilot':
      return { provider: 'openai-codex', credentialKey: 'openai-codex' };
    default:
      return { provider, credentialKey: provider };
  }
}

function resolveModelId(
  provider: string | undefined,
  model: string | undefined,
  defaults?: Record<string, string>,
): string | undefined {
  if (model) return model;
  const key = normalizeProvider(provider).provider;
  if (defaults?.[key]) return defaults[key];
  if (defaults?.[DEFAULT_PROVIDER]) return defaults[DEFAULT_PROVIDER];
  return undefined;
}

function stripJsonSchemaMetadata(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  const cloned = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  delete cloned.$schema;
  delete cloned['~standard'];
  return cloned;
}

function schemaForTool(tool: HudsonTool): Record<string, unknown> {
  const raw = tool.inputSchema;
  let jsonSchema: unknown;
  if (raw && typeof raw === 'object') {
    if ('toJSONSchema' in raw && typeof (raw as { toJSONSchema?: unknown }).toJSONSchema === 'function') {
      // Zod / standard-schema style — derive the JSON schema.
      jsonSchema = (raw as { toJSONSchema: () => unknown }).toJSONSchema();
    } else if ('type' in raw || 'properties' in raw) {
      // Already a plain JSON Schema (portable, AI-SDK-free toolsets like the
      // built-in `intents` toolset). Use it directly instead of dropping it —
      // this matches what the lower-level stream() path already does.
      jsonSchema = raw;
    }
  }
  const schema = stripJsonSchemaMetadata(jsonSchema);
  if (schema && typeof schema === 'object') return schema as Record<string, unknown>;
  return { type: 'object', properties: {}, additionalProperties: true };
}

function compilePiTools(tools: Record<string, HudsonTool>): PiAiTool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description ?? name,
    parameters: schemaForTool(tool) as PiAiTool['parameters'],
  }));
}

function textFromParts(parts: PiAiUIMessagePart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && typeof part === 'object' && (part as PiAiUIMessagePart).type === 'text')
    .map((part) => (part as PiAiUIMessagePart).text ?? '')
    .join('\n');
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toPiUIMessages(messages: PiAiUIMessage[]): PiAiMessage[] {
  const converted: PiAiMessage[] = [];

  for (const message of messages) {
    const text = textFromParts(message.parts) || contentToText(message.content);
    if (!text.trim()) continue;
    if (message.role === 'user') {
      converted.push({ role: 'user', content: text, timestamp: Date.now() });
    } else if (message.role === 'assistant') {
      converted.push({
        role: 'assistant',
        content: [{ type: 'text', text }],
        api: 'openai-completions',
        provider: 'hudson-history',
        model: 'history',
        usage: emptyUsage(),
        stopReason: 'stop',
        timestamp: Date.now(),
      } as AssistantMessage);
    }
  }

  return converted;
}

function normalizedToolArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function canValidateSchema(schema: HudsonTool['inputSchema']): schema is FlexibleSchema<unknown> {
  if (!schema) return false;
  if (typeof schema === 'function') return true;
  if (typeof schema !== 'object') return false;
  return '~standard' in schema || ('validate' in schema && 'jsonSchema' in schema);
}

function validationErrorText(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as { issues?: unknown[] }).issues)) {
    return (error as { issues: Array<{ path?: Array<string | number>; message?: string }> }).issues
      .map(issue => {
        const path = issue.path?.length ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message ?? 'invalid value'}`;
      })
      .join('; ');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

async function validateHudsonToolInput(
  toolName: string,
  tool: HudsonTool,
  rawArgs: unknown,
): Promise<{ ok: true; input: Record<string, unknown> } | { ok: false; input: Record<string, unknown>; errorText: string }> {
  const input = normalizedToolArgs(rawArgs);
  const schema = tool.inputSchema;
  if (!canValidateSchema(schema)) return { ok: true, input };

  const validator = asSchema(schema).validate;
  if (!validator) return { ok: true, input };

  try {
    const result = await validator(input);
    if (result.success) return { ok: true, input: normalizedToolArgs(result.value) };
    return {
      ok: false,
      input,
      errorText: `Invalid arguments for ${toolName}: ${validationErrorText(result.error)}`,
    };
  } catch (err) {
    return {
      ok: false,
      input,
      errorText: `Invalid arguments for ${toolName}: ${validationErrorText(err)}`,
    };
  }
}

async function executeHudsonTool(
  tool: HudsonTool,
  input: Record<string, unknown>,
): Promise<{ result: unknown; isError: boolean; errorText?: string }> {
  if (!tool.execute) {
    return { result: { error: 'Tool is not executable on the server.' }, isError: true, errorText: 'Tool is not executable on the server.' };
  }

  try {
    return { result: await tool.execute(input), isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: { error: message }, isError: true, errorText: message };
  }
}

function resultText(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result);
}

// pi-ai 1.x types tool arguments and result details as JSON. Hudson tool
// inputs are validated objects and results are JSON-serialisable, so these
// casts only restate what the runtime already guarantees.
type PiToolResultDetails = Extract<PiAiMessage, { role: 'toolResult' }>['details'];
type PiToolArguments = ToolCall['arguments'];

function appendToolResult(
  messages: PiAiMessage[],
  toolCall: ToolCall,
  result: unknown,
  isError: boolean,
) {
  messages.push({
    role: 'toolResult',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: 'text', text: resultText(result) }],
    details: result as PiToolResultDetails,
    isError,
    timestamp: Date.now(),
  });
}

interface PendingToolResult {
  toolCall: ToolCall;
  result: unknown;
  isError: boolean;
}

function uiLog(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.log(`[${ts}] ai-backends:pi-ai ${msg}`);
}

function streamUI(req: PiAiUIRequest): Response {
  const { tools, system } = req.loadToolset(req.toolset, req.context ?? {});
  const piTools = compilePiTools(tools);
  const providerConfig = normalizeProvider(req.provider);
  const modelId = resolveModelId(req.provider, req.model, req.defaultModels);
  const credentials = req.loadCredentials();
  const apiKey = credentials[providerConfig.credentialKey] || getEnvApiKey(providerConfig.provider);
  const displayProvider = providerConfig.provider;

  if (!apiKey) {
    throw new Error(`No API key for provider "${displayProvider}".`);
  }
  if (!modelId) {
    throw new Error(
      `No model resolved for provider "${displayProvider}". Pass model in the request or supply defaultModels.`,
    );
  }

  const piModel = getModel(providerConfig.provider as never, modelId as never);
  if (!piModel) {
    throw new Error(
      `No pi-ai model registered for "${providerConfig.provider}/${modelId}". ` +
      `pi-ai's registry is keyed by exact (provider, modelId) pairs. ` +
      `Pick a model that exists for "${providerConfig.provider}", or switch providers.`,
    );
  }
  const piMessages = toPiUIMessages(req.messages);
  const maxSteps = req.maxSteps ?? DEFAULT_MAX_STEPS;

  uiLog(`model resolved: ${providerConfig.provider}/${modelId}`);
  uiLog(`tools: [${piTools.map((tool) => tool.name).join(', ')}] | system: ${system?.length ?? 0} chars`);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      for (let step = 0; step < maxSteps; step++) {
        const streamOptions: SimpleStreamOptions = { apiKey };
        if (req.effort && req.effort !== 'off') {
          streamOptions.reasoning = req.effort;
        }

        const piContext: Context = {
          systemPrompt: system,
          messages: piMessages,
          tools: piTools.length > 0 ? piTools : undefined,
        };
        const assistantStream = req.effort === undefined
          ? piAiStream(piModel, piContext, { apiKey })
          : piAiStreamSimple(piModel, piContext, streamOptions);

        let textPartId: string | null = null;
        let finalMessage: AssistantMessage | null = null;
        let toolCalls = 0;
        const pendingToolResults: PendingToolResult[] = [];

        const endText = () => {
          if (textPartId) {
            writer.write({ type: 'text-end', id: textPartId });
            textPartId = null;
          }
        };

        const emitText = (delta: string) => {
          if (!textPartId) {
            textPartId = generateId();
            writer.write({ type: 'text-start', id: textPartId });
          }
          writer.write({ type: 'text-delta', id: textPartId, delta });
        };

        for await (const event of assistantStream) {
          if (event.type === 'text_delta') {
            emitText(event.delta);
          } else if (event.type === 'toolcall_end') {
            endText();
            toolCalls += 1;
            const toolCall = event.toolCall;
            const toolCallId = toolCall.id || generateId();
            uiLog(`tool_call: ${toolCall.name}`);
            const tool = tools[toolCall.name];
            if (!tool?.execute) {
              const errorText = `Unknown tool: ${toolCall.name}`;
              writer.write({
                type: 'tool-input-error',
                toolCallId,
                toolName: toolCall.name,
                input: toolCall.arguments,
                errorText,
                dynamic: true,
              });
              const result = { error: errorText };
              pendingToolResults.push({ toolCall: { ...toolCall, id: toolCallId }, result, isError: true });
              continue;
            }

            const validation = await validateHudsonToolInput(toolCall.name, tool, toolCall.arguments);
            if (!validation.ok) {
              writer.write({
                type: 'tool-input-error',
                toolCallId,
                toolName: toolCall.name,
                input: validation.input,
                errorText: validation.errorText,
                dynamic: true,
              });
              const result = { error: validation.errorText };
              pendingToolResults.push({ toolCall: { ...toolCall, id: toolCallId, arguments: validation.input as PiToolArguments }, result, isError: true });
              continue;
            }

            writer.write({
              type: 'tool-input-available',
              toolCallId,
              toolName: toolCall.name,
              input: validation.input,
              dynamic: true,
            });

            const { result, isError, errorText } = await executeHudsonTool(tool, validation.input);
            if (isError) {
              writer.write({
                type: 'tool-output-error',
                toolCallId,
                errorText: errorText ?? resultText(result),
                dynamic: true,
              });
            } else {
              writer.write({
                type: 'tool-output-available',
                toolCallId,
                output: result,
                dynamic: true,
              });
            }
            pendingToolResults.push({ toolCall: { ...toolCall, id: toolCallId, arguments: validation.input as PiToolArguments }, result, isError });
          } else if (event.type === 'done') {
            finalMessage = event.message;
          } else if (event.type === 'error') {
            finalMessage = event.error;
            throw new Error(event.error.errorMessage || 'pi-ai stream failed');
          }
        }

        endText();

        if (finalMessage) {
          piMessages.push(finalMessage);
          for (const pending of pendingToolResults) {
            appendToolResult(piMessages, pending.toolCall, pending.result, pending.isError);
          }
          uiLog(`step ${step + 1}: reason=${finalMessage.stopReason} | toolCalls=${toolCalls}`);
        }

        if (!finalMessage || toolCalls === 0) {
          return;
        }
      }

      uiLog(`stopped after ${maxSteps} steps`);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

// ---------------------------------------------------------------------------
// Backend factory
// ---------------------------------------------------------------------------

export function createPiAiBackend(opts?: PiAiBackendOptions): PiAiBackend {
  const credentials = opts?.credentials ?? hudVaultResolver;
  const registry = opts?.registry ?? defaultRegistry;

  const backend: PiAiBackend = {
    id: 'pi-ai',
    label: 'Pi AI',
    surface: 'chat',
    capabilities: {
      streaming: true,
      sessions: false,
      auth: 'api-key',
      relay: 'none',
      models: true,
    },

    async status(config: PiAiConfig) {
      // If caller provided an apiKey directly, we're good
      if (config.apiKey) return { available: true };

      // Try env key
      const envKey = getEnvApiKey(config.provider);
      if (envKey) return { available: true };

      // Try injected credential resolver
      const cred = await credentials({ provider: config.provider });
      if (cred?.apiKey) return { available: true };

      return {
        available: false,
        reason: `No API key for ${config.provider}. Set ${config.provider.toUpperCase().replace(/-/g, '_')}_API_KEY or configure credentials.`,
      };
    },

    async *stream(req: DispatchRequest<PiAiConfig>): AsyncIterable<StreamEvent<PiAiMeta>> {
      const { provider, model: modelId, systemPrompt, apiKey: configKey } = req.config;

      // Resolve API key: config > env > credential resolver
      let apiKey = configKey;
      if (!apiKey) apiKey = getEnvApiKey(provider);
      if (!apiKey) {
        const cred = await credentials({ provider });
        apiKey = cred?.apiKey;
      }
      if (!apiKey) {
        yield {
          type: 'error',
          message: `No API key for ${provider}`,
          recoverable: false,
        };
        return;
      }

      const model = getModel(provider as never, modelId as never);

      // Build system prompt
      const systemParts: string[] = [];
      if (req.system) systemParts.push(req.system);
      if (systemPrompt) systemParts.push(systemPrompt);

      // Compile toolset
      const { tools, systemSuffix } = compileTools(req, registry);
      if (systemSuffix) systemParts.push(systemSuffix);

      const context: Context = {
        systemPrompt: systemParts.join('\n\n') || undefined,
        messages: toPiAiMessages(req.messages, req.input),
        tools,
      };

      const eventStream = piAiStream(model, context, {
        apiKey,
        cacheRetention: 'short',
        signal: req.signal,
      });

      for await (const event of eventStream) {
        if (req.signal?.aborted) return;
        for (const translated of translateEvent(event)) {
          yield translated;
        }
      }
    },

    async dispatch(req: DispatchRequest<PiAiConfig>): Promise<DispatchResult<PiAiMeta>> {
      return aggregateStream(backend, req);
    },

    streamUI,
  };

  return backend;
}
