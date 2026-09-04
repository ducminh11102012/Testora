/**
 * Model names, prices and the shape of the AI configuration.
 *
 * Kept apart from `./config`, which reads the encrypted settings vault, so the
 * console screens can import the choices without pulling the database driver
 * into the browser bundle.
 */

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'custom' | 'none';

/**
 * Which request and response shape the endpoint speaks. A custom endpoint is
 * almost always OpenAI-compatible (vLLM, Ollama, LM Studio, OpenRouter, Groq,
 * Together, Azure OpenAI, most gateways), but a proxy in front of Anthropic or
 * Gemini keeps their own shapes, so all three are offered.
 */
export type WireFormat = 'openai' | 'anthropic' | 'google';

/** How the key is presented. Gateways disagree, so this is configurable. */
export type AuthStyle = 'bearer' | 'x-api-key' | 'api-key' | 'query' | 'none';

export interface ModelPrice {
  /** US cents per million tokens, so integer arithmetic stays exact. */
  inputCentsPerMTok: number;
  outputCentsPerMTok: number;
}

export interface AiConfig {
  provider: ProviderName;
  model: string;
  /** Encrypted at rest; never leaves the server. */
  apiKeyEnc: string;
  /**
   * Where to send the call. Blank means the provider's own public endpoint, so
   * an existing configuration keeps working untouched. Set it to put a proxy,
   * a gateway or a self-hosted server in front of any provider.
   */
  baseUrl: string;
  /** Only consulted for `custom`; the named providers own their wire format. */
  wire: WireFormat;
  /** Only consulted for `custom`; the named providers own their auth header. */
  authStyle: AuthStyle;
  /** Extra headers a gateway insists on, e.g. an org id or a referer. */
  extraHeaders: Record<string, string>;
  /** Feature switches, so a centre can pay for parsing but mark writing by hand. */
  parsingEnabled: boolean;
  writingMarkingEnabled: boolean;
  transformJudgingEnabled: boolean;
  /** Stop runaway spend: 0 means no limit. */
  monthlyBudgetCents: number;
  /**
   * Ceiling on a single reply, in tokens. 0 means "as much as the model will
   * give": the field is left out of the request entirely. A whole book of
   * papers is read piece by piece rather than in one reply, so the ceiling is
   * there for a gateway that insists on one, not to keep replies short.
   */
  maxOutputTokens: number;
  /**
   * Whether to ask for a streamed reply, which is what lets the console show
   * the model working. On by default, and the driver already falls back on its
   * own when an endpoint refuses or ignores the request — this is the switch
   * for an endpoint that accepts a stream and then handles it badly (a proxy
   * that buffers the whole response, say). `undefined` means on.
   */
  streaming?: boolean;
  price: ModelPrice;
  /** Text sent to the marker model in front of every rubric. */
  markingGuidance: string;
}

/** List prices at the time of writing; editable in the console. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-5': { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
  'claude-haiku-4-5': { inputCentsPerMTok: 100, outputCentsPerMTok: 500 },
  'gpt-4o': { inputCentsPerMTok: 250, outputCentsPerMTok: 1000 },
  'gpt-4o-mini': { inputCentsPerMTok: 15, outputCentsPerMTok: 60 },
  'gemini-2.0-flash': { inputCentsPerMTok: 10, outputCentsPerMTok: 40 },
};

export const MODEL_CHOICES: Record<'anthropic' | 'openai' | 'google', string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.0-flash'],
};

/** The public endpoint each wire format talks to when no base URL is given. */
export const DEFAULT_BASE_URL: Record<WireFormat, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
};

/** What each named provider speaks, so `custom` is the only one that chooses. */
export const WIRE_OF: Record<'anthropic' | 'openai' | 'google', WireFormat> = {
  anthropic: 'anthropic', openai: 'openai', google: 'google',
};

export const AUTH_OF: Record<'anthropic' | 'openai' | 'google', AuthStyle> = {
  anthropic: 'x-api-key', openai: 'bearer', google: 'query',
};

/** Ready-made settings for the endpoints people ask about most. */
export const CUSTOM_PRESETS: Array<{
  name: string; baseUrl: string; wire: WireFormat; authStyle: AuthStyle; model: string; note: string;
}> = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', wire: 'openai', authStyle: 'bearer',
    model: 'anthropic/claude-sonnet-4.5', note: 'One key, many models.' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', wire: 'openai', authStyle: 'bearer',
    model: 'llama-3.3-70b-versatile', note: 'Fast and cheap for parsing.' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1', wire: 'openai', authStyle: 'bearer',
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', note: 'Open-weight models.' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', wire: 'openai', authStyle: 'bearer',
    model: 'deepseek-chat', note: 'Cheap, strong at structured output.' },
  { name: 'Ollama (same machine)', baseUrl: 'http://127.0.0.1:11434/v1', wire: 'openai', authStyle: 'none',
    model: 'qwen2.5:14b-instruct', note: 'Self-hosted, no key, nothing leaves the server.' },
  { name: 'vLLM / LM Studio', baseUrl: 'http://127.0.0.1:8000/v1', wire: 'openai', authStyle: 'none',
    model: 'your-served-model', note: 'Any OpenAI-compatible server.' },
  { name: 'Azure OpenAI', baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>', wire: 'openai', authStyle: 'api-key',
    model: '<deployment name>', note: 'Add api-version=… to the URL.' },
];

/**
 * Reading a paper and marking one are different jobs, and centres often want
 * different models for them: something cheap and fast for parsing, something
 * careful for marking — or a self-hosted model for one and a hosted one for the
 * other. Each job therefore has its own endpoint, key and model, with a switch
 * to collapse them back into a single provider that does both.
 */
export type AiRole = 'parse' | 'mark' | 'vision';

export interface AiSettings {
  /** True when one provider does every job; then only `parse` is used. */
  unified: boolean;
  /** Reading uploaded papers, and writing an answer key the paper lacks. */
  parse: AiConfig;
  /** Marking writing, and judging sentence transformations. */
  mark: AiConfig;
  /** Reading a photographed or scanned paper — a model that can see. */
  vision: AiConfig;
}

export const ROLE_LABEL: Record<AiRole, string> = {
  parse: 'Reading papers',
  mark: 'Marking',
  vision: 'Reading photographs and scans',
};

export const ROLE_HINT: Record<AiRole, string> = {
  parse: 'Classifies each task in an uploaded paper, places the gaps, and writes the answer key when the paper has none.',
  mark: 'Marks extended writing against your rubric, and decides whether a sentence transformation means the same thing.',
  vision: 'Reads a paper that exists only as photographs or a scan, page by page. Needs a model that accepts images.',
};

export const AI_FALLBACK: AiConfig = {
  provider: 'none',
  model: '',
  apiKeyEnc: '',
  baseUrl: '',
  wire: 'openai',
  authStyle: 'bearer',
  extraHeaders: {},
  parsingEnabled: true,
  writingMarkingEnabled: true,
  transformJudgingEnabled: true,
  monthlyBudgetCents: 0,
  maxOutputTokens: 0,
  streaming: true,
  price: { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
  markingGuidance:
    'You are an experienced examiner. Mark strictly against the rubric, reward what the candidate '
    + 'actually wrote, and never invent content they did not produce.',
};

/** The wire format and auth header a configuration actually uses. */
export function wireOf(config: Pick<AiConfig, 'provider' | 'wire'>): WireFormat {
  return config.provider === 'custom' || config.provider === 'none'
    ? config.wire
    : WIRE_OF[config.provider];
}

export function authStyleOf(config: Pick<AiConfig, 'provider' | 'authStyle'>): AuthStyle {
  return config.provider === 'custom' || config.provider === 'none'
    ? config.authStyle
    : AUTH_OF[config.provider];
}

/** Trailing slashes are the commonest mistake; strip them once, here. */
export function endpointBase(config: Pick<AiConfig, 'provider' | 'wire' | 'baseUrl'>): string {
  const raw = (config.baseUrl || '').trim().replace(/\/+$/, '');
  return raw || DEFAULT_BASE_URL[wireOf(config)];
}

/** A fresh pair of slots, both switched off. */
export function emptyAiSettings(): AiSettings {
  return {
    unified: true,
    parse: { ...AI_FALLBACK },
    mark: { ...AI_FALLBACK },
    vision: { ...AI_FALLBACK, model: '' },
  };
}

/**
 * What one reply may use. A configuration that names no ceiling gets none:
 * `undefined` tells the driver to leave the limit out of the request, so the
 * model gives whatever it has. `want` is what the caller would like when the
 * operator has capped the platform, and the smaller of the two wins.
 */
export function outputCap(config: Pick<AiConfig, 'maxOutputTokens'>, want?: number): number | undefined {
  const capped = config.maxOutputTokens > 0 ? config.maxOutputTokens : 0;
  if (!capped) return want && want > 0 ? want : undefined;
  if (!want || want <= 0) return capped;
  return Math.min(capped, want);
}

/** Whether this configuration wants a streamed reply. Unset means yes. */
export function streamingOn(config: Pick<AiConfig, 'streaming'>): boolean {
  return config.streaming !== false;
}

/** Models known to read images, offered when a vision provider is chosen. */
export const VISION_MODEL_CHOICES: Record<'anthropic' | 'openai' | 'google', string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.0-flash'],
};

/** Which slot a job actually reads: with one provider, everything reads `parse`. */
export function slotFor(settings: AiSettings, role: AiRole): AiConfig {
  return settings.unified ? settings.parse : settings[role];
}
