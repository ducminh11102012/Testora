import { aiUsage } from '../db';
import { AiConfig, ProviderName, apiKeyOf, loadAiConfig } from './config';
import { AuthStyle, authStyleOf, endpointBase, streamingOn, wireOf } from './models';
import { parseModelJson } from './json';

export interface ModelImage {
  /** image/png, image/jpeg, image/webp — or application/pdf for a whole document. */
  mime: string;
  base64: string;
}

export interface ModelCall {
  system?: string;
  prompt: string;
  /** Leave undefined for "as much as the model will give". */
  maxTokens?: number;
  /**
   * Called with each piece of text as it arrives.
   *
   * Reading a long paper takes a minute or two, and a spinner for a minute is
   * indistinguishable from a spinner for ever. Passing this switches the call
   * to a streamed response, so the console can show what the model is writing
   * while it writes it and how far through it is. The returned text is the same
   * either way, so nothing downstream needs to know which mode was used.
   */
  onDelta?: (chunk: string, soFar: string) => void;
  temperature?: number;
  json?: boolean;
  /**
   * Ask for JSON in words only — no `response_format`, no `responseMimeType`.
   * Plenty of servers that advertise the OpenAI wire either reject that field
   * or, worse, accept it and answer with an empty string; a retry with this set
   * is how a reply comes back at all from those.
   */
  noJsonMode?: boolean;
  /**
   * Send no `temperature` at all. The newer reasoning models accept only their
   * own default and answer 400 to anything else, including the zero this
   * platform would otherwise always send.
   */
  noTemperature?: boolean;
  /** Pages of a photographed or scanned paper, for a vision model. */
  images?: ModelImage[];
}

export interface ModelResult {
  text: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  /**
   * Why the model stopped. `length` means it ran out of output budget, which is
   * the difference between "the paper is wrong" and "the reply is unfinished".
   */
  finishReason?: string;
  /**
   * What the model said when it did not say what was asked for. Kept so a
   * failure can be reported with the model's own words instead of "the model
   * did not return JSON", which tells whoever uploaded the paper nothing.
   */
  refusal?: string;
  /** Characters of reasoning the model emitted, when it separates them out. */
  reasoningChars?: number;
}

export interface CallContext {
  /** What the call was for: shown in the usage report. */
  feature: 'parse' | 'vision-parse' | 'answer-key' | 'explanations' | 'writing-marking'
    | 'transform-judging' | 'connection-test';
  orgId?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
}

/* ------------------------------- providers ------------------------------ */

/**
 * Every call goes to `base` — the provider's public endpoint, or whatever
 * endpoint the console was given. That is what makes a self-hosted server, a
 * gateway or a company proxy a first-class provider rather than a special case.
 */

/** The key goes wherever the endpoint expects it: header, header name, or query. */
function auth(style: AuthStyle, key: string): { headers: Record<string, string>; query: string } {
  if (!key || style === 'none') return { headers: {}, query: '' };
  if (style === 'bearer') return { headers: { authorization: `Bearer ${key}` }, query: '' };
  if (style === 'x-api-key') return { headers: { 'x-api-key': key } , query: '' };
  if (style === 'api-key') return { headers: { 'api-key': key }, query: '' };
  return { headers: {}, query: `key=${encodeURIComponent(key)}` };
}

/** Adds a query string to a URL that may already carry one (Azure's api-version). */
function withQuery(url: string, query: string): string {
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
}

/**
 * Reads a `text/event-stream` body line by line and hands over each `data:`
 * payload. Every provider here speaks the same envelope even though what is
 * inside it differs, so the envelope is dealt with once.
 */
async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Events are separated by a blank line; a partial one waits for more bytes.
    let cut = buffer.indexOf('\n\n');
    while (cut >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') onEvent(payload);
      }
      cut = buffer.indexOf('\n\n');
    }
  }
}

/** Collects a streamed reply, reporting each piece as it lands. */
interface StreamedReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
  refusal?: string;
  /** Reasoning tokens, which are not the answer but explain an empty one. */
  reasoningChars?: number;
}

function streamCollector(call: ModelCall) {
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason: string | undefined;
  let refusal: string | undefined;
  let reasoningChars = 0;
  return {
    push(chunk: string) {
      if (!chunk) return;
      text += chunk;
      call.onDelta?.(chunk, text);
    },
    usage(input?: number, output?: number) {
      if (typeof input === 'number' && input > 0) inputTokens = input;
      if (typeof output === 'number' && output > 0) outputTokens = output;
    },
    stop(reason?: string) { if (reason) finishReason = reason; },
    /** Thinking, which is not the answer: counted, never concatenated. */
    thought(chunk?: string) { if (chunk) reasoningChars += chunk.length; },
    refused(chunk?: string) { if (chunk) refusal = `${refusal ?? ''}${chunk}`; },
    done(): StreamedReply {
      return {
        text,
        inputTokens,
        // Not every provider reports usage on a stream; the character count is
        // a usable stand-in for a cost estimate, at roughly four to a token.
        outputTokens: outputTokens || Math.round(text.length / 4),
        finishReason,
        refusal,
        reasoningChars: reasoningChars || undefined,
      };
    },
  };
}

async function callOpenAiWire(
  base: string, key: string, style: AuthStyle, extra: Record<string, string>, model: string,
  call: ModelCall, allowStream = true,
): Promise<StreamedReply> {
  const a = auth(style, key);
  const streaming = !!call.onDelta && allowStream;
  const res = await fetch(withQuery(`${base}/chat/completions`, a.query), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...a.headers, ...extra },
    body: JSON.stringify({
      model,
      ...(call.noTemperature ? {} : { temperature: call.temperature ?? 0 }),
      /*
       * `stream_options` is OpenAI's own extension. Most compatible servers
       * accept it and report usage at the end of the stream; a strict one
       * rejects the unknown field outright, which is why a refused streamed
       * request is retried without any of this rather than failing the job.
       */
      ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
      ...(call.json && !call.noJsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        ...(call.system ? [{ role: 'system', content: call.system }] : []),
        {
          role: 'user',
          // A vision call sends the pages alongside the instructions.
          content: call.images?.length
            ? [
                { type: 'text', text: call.prompt },
                ...call.images.map((img) => ({
                  type: 'image_url',
                  image_url: { url: `data:${img.mime};base64,${img.base64}` },
                })),
              ]
            : call.prompt,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    // The endpoint would not take a streamed request. Ask again the plain way:
    // watching the model work is a convenience, and reading the paper is not.
    if (streaming) return callOpenAiWire(base, key, style, extra, model, call, false);

    /*
     * A field this model does not accept. The newer reasoning models are the
     * common case — they refuse `temperature` other than 1, want
     * `max_completion_tokens` instead of `max_tokens`, and some deployments
     * reject `response_format` outright. The server names the field it did not
     * like, so it is dropped and the call made again rather than failing an
     * import over a parameter nobody asked for.
     */
    if (res.status === 400) {
      if (/temperature/i.test(body) && !call.noTemperature) {
        return callOpenAiWire(base, key, style, extra, model, { ...call, noTemperature: true }, false);
      }
      if (/max_tokens|max_completion_tokens/i.test(body) && call.maxTokens) {
        return callOpenAiWire(base, key, style, extra, model, { ...call, maxTokens: undefined }, false);
      }
      if (/response_format|json_object|json mode/i.test(body) && call.json && !call.noJsonMode) {
        return callOpenAiWire(base, key, style, extra, model, { ...call, noJsonMode: true }, false);
      }
    }
    throw new Error(`${base} ${res.status}: ${body.slice(0, 300)}`);
  }

  // A server that ignored `stream` answers with ordinary JSON; both are handled
  // rather than trusting the request to have been honoured.
  if (streaming && res.body && (res.headers.get('content-type') ?? '').includes('event-stream')) {
    const collect = streamCollector(call);
    await readEventStream(res.body, (payload) => {
      try {
        const event = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string | Array<{ text?: string }>;
              reasoning_content?: string;
              reasoning?: string;
              refusal?: string;
            };
            finish_reason?: string;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') collect.push(delta);
        else if (Array.isArray(delta)) collect.push(delta.map((d) => d.text ?? '').join(''));
        collect.thought(event.choices?.[0]?.delta?.reasoning_content ?? event.choices?.[0]?.delta?.reasoning);
        collect.refused(event.choices?.[0]?.delta?.refusal);
        collect.stop(event.choices?.[0]?.finish_reason ?? undefined);
        collect.usage(event.usage?.prompt_tokens, event.usage?.completion_tokens);
      } catch { /* a keep-alive or a comment: nothing to collect */ }
    });
    const streamed = collect.done();
    /*
     * A stream that produced nothing usually means a proxy in the middle that
     * buffers or drops event streams. The reply is asked for again without the
     * stream rather than treating an empty answer as the model's answer.
     */
    if (streamed.text.trim()) return streamed;
    return callOpenAiWire(base, key, style, extra, model, call, false);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  /*
   * Where the answer actually is, across the servers that claim this wire.
   * A reasoning model puts its thinking in `reasoning_content` (or `reasoning`)
   * and the answer in `content` — and when it runs out of room it sends the
   * thinking and *nothing else*, which used to arrive here as an empty string
   * and be reported as "the model did not return JSON". A refusal comes back in
   * its own field again. All three are read, and the last two are reported
   * rather than silently turning into an empty reply.
   */
  const text = typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((c: { text?: string }) => c.text ?? '').join('')
      : '';
  const reasoning = typeof message?.reasoning_content === 'string'
    ? message.reasoning_content
    : typeof message?.reasoning === 'string' ? message.reasoning : '';
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0,
    finishReason: data.choices?.[0]?.finish_reason ?? undefined,
    refusal: typeof message?.refusal === 'string' ? message.refusal : undefined,
    reasoningChars: reasoning.length || undefined,
  };
}

/**
 * The Anthropic wire insists on a number, so a call that asked for no ceiling
 * gets a deliberately generous one. Models differ in what they will accept, and
 * a refusal names the ceiling that model does allow, so the call is made again
 * with a smaller one rather than failing the import.
 */
const ANTHROPIC_OPEN_MAX = 64_000;

async function callAnthropicWire(
  base: string, key: string, style: AuthStyle, extra: Record<string, string>, model: string,
  call: ModelCall, maxTokens = call.maxTokens ?? ANTHROPIC_OPEN_MAX, allowStream = true,
): Promise<StreamedReply> {
  const a = auth(style, key);
  const res = await fetch(withQuery(`${base}/messages`, a.query), {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...a.headers, ...extra,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(call.onDelta && allowStream ? { stream: true } : {}),
      temperature: call.temperature ?? 0,
      system: call.system,
      messages: [{
        role: 'user',
        content: call.images?.length
          ? [
              ...call.images.map((img) => (img.mime === 'application/pdf'
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.base64 } }
                : { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } })),
              { type: 'text', text: call.prompt },
            ]
          : call.prompt,
      }],
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    // "max_tokens: 8192 > 4096, which is the maximum allowed" — take the model
    // at its word and ask again for what it says it can give.
    const allowed = /max(?:imum)?[^0-9]{0,40}?(\d{3,7})/i.exec(body);
    const ceiling = allowed ? Number(allowed[1]) : 0;
    if (res.status === 400 && /max_tokens/i.test(body) && ceiling > 0 && ceiling < maxTokens) {
      return callAnthropicWire(base, key, style, extra, model, call, ceiling, allowStream);
    }
    // A proxy in front of Anthropic that will not stream: ask again plainly.
    if (call.onDelta && allowStream) {
      return callAnthropicWire(base, key, style, extra, model, call, maxTokens, false);
    }
    throw new Error(`${base} ${res.status}: ${body.slice(0, 300)}`);
  }

  if (call.onDelta && allowStream && res.body && (res.headers.get('content-type') ?? '').includes('event-stream')) {
    const collect = streamCollector(call);
    await readEventStream(res.body, (payload) => {
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { text?: string; thinking?: string; stop_reason?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (event.type === 'content_block_delta' && event.delta?.text) collect.push(event.delta.text);
        // A thinking block is not the answer. Counted so an empty answer can
        // be explained rather than reported as "no JSON".
        if (event.type === 'content_block_delta' && event.delta?.thinking) collect.thought(event.delta.thinking);
        if (event.type === 'message_delta') {
          collect.stop(event.delta?.stop_reason === 'max_tokens' ? 'length' : event.delta?.stop_reason);
          collect.usage(undefined, event.usage?.output_tokens);
        }
        if (event.type === 'message_start') {
          collect.usage(event.message?.usage?.input_tokens, event.message?.usage?.output_tokens);
        }
      } catch { /* a ping event */ }
    });
    const streamed = collect.done();
    if (streamed.text.trim()) return streamed;
    return callAnthropicWire(base, key, style, extra, model, call, maxTokens, false);
  }

  const data = await res.json();
  const blocks: Array<{ type: string; text?: string; thinking?: string }> = data.content ?? [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    // Anthropic says `max_tokens`; everything else says `length`.
    finishReason: data.stop_reason === 'max_tokens' ? 'length' : data.stop_reason ?? undefined,
    reasoningChars: blocks.filter((b) => b.type === 'thinking')
      .reduce((n, b) => n + (b.thinking?.length ?? 0), 0) || undefined,
  };
}

async function callGoogleWire(
  base: string, key: string, style: AuthStyle, extra: Record<string, string>, model: string,
  call: ModelCall, allowStream = true,
): Promise<StreamedReply> {
  const a = auth(style, key);
  const streaming = !!call.onDelta && allowStream;
  const method = streaming ? 'streamGenerateContent' : 'generateContent';
  const query = streaming ? [a.query, 'alt=sse'].filter(Boolean).join('&') : a.query;
  const res = await fetch(withQuery(`${base}/models/${model}:${method}`, query), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...a.headers, ...extra },
    body: JSON.stringify({
      contents: [{
        parts: [
          ...(call.images ?? []).map((img) => ({ inlineData: { mimeType: img.mime, data: img.base64 } })),
          { text: call.prompt },
        ],
      }],
      ...(call.system ? { systemInstruction: { parts: [{ text: call.system }] } } : {}),
      generationConfig: {
        temperature: call.temperature ?? 0,
        ...(call.maxTokens ? { maxOutputTokens: call.maxTokens } : {}),
        ...(call.json && !call.noJsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    // A gateway that only exposes the non-streaming method.
    if (streaming) return callGoogleWire(base, key, style, extra, model, call, false);
    throw new Error(`${base} ${res.status}: ${body.slice(0, 300)}`);
  }

  if (streaming && res.body && (res.headers.get('content-type') ?? '').includes('event-stream')) {
    const collect = streamCollector(call);
    await readEventStream(res.body, (payload) => {
      try {
        const event = JSON.parse(payload) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; thought?: boolean }> };
            finishReason?: string;
          }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const parts = event.candidates?.[0]?.content?.parts ?? [];
        collect.push(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
        collect.thought(parts.filter((p) => p.thought).map((p) => p.text ?? '').join(''));
        const reason = event.candidates?.[0]?.finishReason;
        collect.stop(reason === 'MAX_TOKENS' ? 'length' : reason);
        collect.usage(event.usageMetadata?.promptTokenCount, event.usageMetadata?.candidatesTokenCount);
      } catch { /* not a data event */ }
    });
    const streamed = collect.done();
    if (streamed.text.trim()) return streamed;
    return callGoogleWire(base, key, style, extra, model, call, false);
  }

  const data = await res.json();
  const parts: Array<{ text?: string; thought?: boolean }> = data.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''),
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    finishReason: data.candidates?.[0]?.finishReason === 'MAX_TOKENS'
      ? 'length'
      : data.candidates?.[0]?.finishReason ?? undefined,
    reasoningChars: parts.filter((p) => p.thought).reduce((n, p) => n + (p.text?.length ?? 0), 0) || undefined,
  };
}

/* -------------------------------- driver -------------------------------- */

/* --------------------------- one at a time ------------------------------- */

/**
 * How many model calls this process makes at once.
 *
 * Free and self-hosted endpoints commonly allow **one**:
 *
 *   429 {"code":"concurrency_limit_exceeded","message":"Too many concurrent
 *        requests (limit: 1)","limit":1,"role":"free"}
 *
 * and a book of eighty-four papers hitting that means eighty-four papers read
 * by the rule parser alone, which is what happened. Calls queue here instead.
 * The wait costs nothing — this is background work — and one queue is cheaper
 * than every caller having to know about the limit.
 */
const AT_ONCE = Math.max(1, Number(process.env.AI_CONCURRENCY ?? '1') || 1);

let running = 0;
const waiting: Array<() => void> = [];

async function enterLane(): Promise<void> {
  if (running < AT_ONCE) { running += 1; return; }
  await new Promise<void>((resolve) => { waiting.push(resolve); });
  running += 1;
}

function leaveLane(): void {
  running -= 1;
  const next = waiting.shift();
  if (next) next();
}

/** Server said "not now". How long to wait before asking again. */
function retryAfterMs(message: string, attempt: number): number {
  const header = /retry[- ]after[^0-9]{0,4}(\d{1,4})/i.exec(message);
  if (header) return Math.min(60_000, Number(header[1]) * 1000);
  // 1s, 3s, 7s, 15s — long enough for a one-at-a-time endpoint to free up.
  return Math.min(30_000, 1_000 * (2 ** attempt - 1) + 1_000);
}

/**
 * Whether it is worth asking again. A rate limit, a busy model and a gateway
 * hiccup all pass; a bad key or a bad request do not, because asking again
 * would fail the same way and cost the operator the wait.
 */
function worthRetrying(message: string): boolean {
  if (/\b(429|409)\b/.test(message)) return true;
  if (/\b(500|502|503|504)\b/.test(message)) return true;
  return /rate.?limit|concurren|too many|overloaded|capacity|try again|temporarily/i.test(message);
}

const MAX_ATTEMPTS = Math.max(1, Number(process.env.AI_RETRIES ?? '4') || 4);

/**
 * One entry point for every model call. It resolves the platform's
 * configuration, prices the call and writes a usage row, so the administrator
 * can always see who spent what — including which organisation's import
 * triggered it.
 */
export async function callModel(call: ModelCall, ctx: CallContext, config?: AiConfig): Promise<ModelResult> {
  // Callers normally pass the configuration for their job; marking features
  // fall back to the marking provider, everything else to the parsing one.
  const cfg = config ?? await loadAiConfig(
    ctx.feature === 'writing-marking' || ctx.feature === 'transform-judging' ? 'mark'
      : ctx.feature === 'vision-parse' ? 'vision'
        : 'parse',
  );
  const key = apiKeyOf(cfg);
  if (cfg.provider === 'none') throw new Error('No AI provider is configured.');
  // A self-hosted endpoint needs no key; a hosted one does.
  if (!key && cfg.provider !== 'custom') throw new Error('No AI provider is configured.');
  if (!cfg.model) throw new Error('No model name is set for this provider.');

  const base = endpointBase(cfg);
  const wire = wireOf(cfg);
  /*
   * The operator can turn streaming off for one provider. `custom` has no wire
   * of its own — it speaks one of the three above — so this and the fallbacks
   * inside each wire cover a self-hosted server or a gateway just as much as a
   * hosted provider.
   */
  const wanted = streamingOn(cfg) ? call : { ...call, onDelta: undefined };
  const style = authStyleOf(cfg);
  const extra = cfg.extraHeaders ?? {};

  const started = Date.now();
  try {
    let raw: StreamedReply | null = null;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await enterLane();
      try {
        raw = wire === 'anthropic' ? await callAnthropicWire(base, key, style, extra, cfg.model, wanted)
          : wire === 'google' ? await callGoogleWire(base, key, style, extra, cfg.model, wanted)
            : await callOpenAiWire(base, key, style, extra, cfg.model, wanted);
        break;
      } catch (err) {
        lastError = err as Error;
        if (attempt >= MAX_ATTEMPTS || !worthRetrying(lastError.message)) throw lastError;
      } finally {
        // The lane is given up *before* the wait, so a one-at-a-time endpoint
        // is not held idle by a call that is only sleeping.
        leaveLane();
      }
      await new Promise((resolve) => { setTimeout(resolve, retryAfterMs(lastError!.message, attempt)); });
    }
    if (!raw) throw lastError ?? new Error('The model call did not run.');

    const costMicros = Math.round(
      (raw.inputTokens / 1_000_000) * cfg.price.inputCentsPerMTok * 10_000
      + (raw.outputTokens / 1_000_000) * cfg.price.outputCentsPerMTok * 10_000,
    );

    await aiUsage.record({
      orgId: ctx.orgId, userId: ctx.userId, feature: ctx.feature,
      provider: cfg.provider, model: cfg.model,
      inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, costMicros,
      meta: { ...ctx.meta, ms: Date.now() - started, finishReason: raw.finishReason },
    });

    return { ...raw, provider: cfg.provider, model: cfg.model, costMicros };
  } catch (err) {
    await aiUsage.record({
      orgId: ctx.orgId, userId: ctx.userId, feature: ctx.feature,
      provider: cfg.provider, model: cfg.model, ok: false,
      meta: { ...ctx.meta, error: (err as Error).message.slice(0, 300) },
    });
    throw err;
  }
}

/**
 * Pulls the JSON out of a model reply, repairing a reply that was cut off
 * rather than throwing away everything the model did manage to write.
 */
export function extractJson(raw: string): unknown {
  return parseModelJson(raw).value;
}

export { parseModelJson };

/** US cents, for display. */
export const centsOf = (micros: number) => micros / 10_000;
