import { editVault, readVault } from '../storage/vault';
import {
  AI_FALLBACK as FALLBACK, AiConfig, AiRole, AiSettings, AuthStyle, DEFAULT_PRICES, ModelPrice,
  ProviderName, WireFormat, emptyAiSettings, endpointBase, slotFor,
} from './models';
import { decryptSecret, encryptSecret, maskSecret } from './secret';

export * from './models';

/**
 * Configuration set in the console wins; environment variables remain a valid
 * way to run the platform, so a deployment can be configured either way.
 *
 * It is kept in the encrypted settings object in the private bucket, never in
 * the database — a leaked database gives up no provider keys.
 */

/** Fills a stored slot out to a complete configuration. */
function hydrate(stored: Partial<AiConfig> | undefined): AiConfig {
  return {
    ...FALLBACK,
    ...(stored ?? {}),
    price: { ...FALLBACK.price, ...(stored?.price ?? {}) },
    extraHeaders: { ...(stored?.extraHeaders ?? {}) },
  };
}

/** A provider taken from environment variables, or null when none is set. */
function fromEnv(base: AiConfig): AiConfig | null {
  const envProvider = (process.env.AI_PROVIDER ?? '').toLowerCase() as ProviderName;

  // A custom endpoint set by environment variables, for a deployment that
  // would rather not keep credentials in the console at all.
  const customUrl = (process.env.AI_BASE_URL ?? '').trim();
  if (envProvider === 'custom' || customUrl) {
    const model = process.env.AI_MODEL || base.model;
    return {
      ...base,
      provider: 'custom',
      model,
      baseUrl: customUrl || base.baseUrl,
      wire: ((process.env.AI_WIRE ?? base.wire).toLowerCase() as WireFormat),
      authStyle: ((process.env.AI_AUTH_STYLE ?? (process.env.AI_API_KEY ? 'bearer' : 'none')).toLowerCase() as AuthStyle),
      apiKeyEnc: process.env.AI_API_KEY ? encryptSecret(process.env.AI_API_KEY) : '',
      price: DEFAULT_PRICES[model] ?? base.price,
    };
  }

  const candidates: [ProviderName, string | undefined, string][] = [
    ['anthropic', process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'],
    ['openai', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o'],
    ['google', process.env.GOOGLE_API_KEY, process.env.GOOGLE_MODEL || 'gemini-2.0-flash'],
  ];
  const preferred = candidates.find(([name, key]) => name === envProvider && key)
    ?? candidates.find(([, key]) => !!key);
  if (!preferred) return null;

  const [provider, key, model] = preferred;
  return {
    ...base,
    provider,
    model: base.model || model,
    apiKeyEnc: encryptSecret(key!),
    price: DEFAULT_PRICES[model] ?? base.price,
  };
}

/**
 * Both slots, as they will actually be used. A deployment that predates the
 * split kept one configuration under `ai`; it becomes the shared provider, so
 * nothing needs re-entering.
 */
export async function loadAiSettings(): Promise<AiSettings> {
  const vault = await readVault().catch(() => ({} as Record<string, unknown>));
  const stored = vault.aiSettings as Partial<AiSettings> | undefined;
  const legacy = vault.ai as Partial<AiConfig> | undefined;

  const settings: AiSettings = stored
    ? {
        unified: stored.unified !== false,
        parse: hydrate(stored.parse as Partial<AiConfig> | undefined),
        mark: hydrate(stored.mark as Partial<AiConfig> | undefined),
        vision: hydrate(stored.vision as Partial<AiConfig> | undefined),
      }
    : legacy
      ? { unified: true, parse: hydrate(legacy), mark: hydrate(legacy), vision: hydrate(legacy) }
      : emptyAiSettings();

  // Environment variables only fill a slot nobody has configured by hand.
  const unset = (c: AiConfig) => !c.apiKeyEnc && !c.baseUrl.trim();
  if (unset(settings.parse)) settings.parse = fromEnv(settings.parse) ?? settings.parse;
  if (unset(settings.mark)) {
    settings.mark = settings.unified ? settings.parse : (fromEnv(settings.mark) ?? settings.mark);
  }
  if (unset(settings.vision)) {
    settings.vision = settings.unified ? settings.parse : (fromEnv(settings.vision) ?? settings.vision);
  }
  return settings;
}

/** The configuration one job should use. */
export async function loadAiConfig(role: AiRole = 'parse'): Promise<AiConfig> {
  return slotFor(await loadAiSettings(), role);
}

/** Saves one slot. `role` is ignored while a single provider does both jobs. */
export async function saveAiConfig(
  patch: Partial<AiConfig> & { apiKey?: string },
  role: AiRole = 'parse',
): Promise<AiSettings> {
  await editVault((v) => {
    /** Slots as stored: every field optional, because a slot may be half-filled. */
    type StoredSettings = { unified?: boolean } & Partial<Record<AiRole, Partial<AiConfig>>>;
    const legacySlot = v.ai as Partial<AiConfig> | undefined;
    const current: StoredSettings = (v.aiSettings as StoredSettings | undefined)
      ?? (legacySlot ? { unified: true, parse: legacySlot, mark: legacySlot, vision: legacySlot } : undefined)
      ?? emptyAiSettings();

    const unified = current.unified !== false;
    const slot = unified ? 'parse' : role;
    const next: Partial<AiConfig> = { ...(current[slot] ?? {}), ...patch };
    delete (next as { apiKey?: string }).apiKey;
    if (patch.apiKey !== undefined) next.apiKeyEnc = patch.apiKey ? encryptSecret(patch.apiKey) : '';
    if (patch.model && !patch.price) next.price = DEFAULT_PRICES[patch.model] ?? next.price;

    v.aiSettings = { ...current, unified, [slot]: next } as unknown as Record<string, unknown>;
  });
  return loadAiSettings();
}

/**
 * Turns the split on or off. Splitting copies the shared provider into both
 * slots, so each job starts from what was already working; merging keeps the
 * parsing provider, and says so in the console.
 */
export async function setAiUnified(unified: boolean): Promise<AiSettings> {
  const before = await loadAiSettings();
  await editVault((v) => {
    const parse = { ...before.parse };
    const keep = (slot: AiConfig) => (unified || before.unified ? { ...before.parse } : { ...slot });
    v.aiSettings = {
      unified, parse, mark: keep(before.mark), vision: keep(before.vision),
    } as unknown as Record<string, unknown>;
  });
  return loadAiSettings();
}

export function apiKeyOf(config: AiConfig): string {
  return decryptSecret(config.apiKeyEnc);
}

/** Safe to send to the browser. */
export function publicAiConfig(config: AiConfig) {
  const { apiKeyEnc, ...rest } = config;
  return {
    ...rest,
    apiKeyMasked: maskSecret(decryptSecret(apiKeyEnc)),
    configured: isConfigured(config),
    hasKey: !!apiKeyEnc,
    /** Where a call would actually go, so the console can show it plainly. */
    resolvedEndpoint: config.provider === 'none' ? '' : endpointBase(config),
  };
}

export function publicAiSettings(settings: AiSettings) {
  return {
    unified: settings.unified,
    parse: publicAiConfig(settings.parse),
    mark: publicAiConfig(settings.mark),
    vision: publicAiConfig(settings.vision),
  };
}

/**
 * A hosted provider needs a key. A custom endpoint needs a URL and a model —
 * a server on the same machine usually has no key at all, and demanding one
 * would make self-hosting impossible.
 */
export function isConfigured(config: AiConfig): boolean {
  if (config.provider === 'none') return false;
  if (config.provider === 'custom') return !!config.baseUrl.trim() && !!config.model.trim();
  return !!apiKeyOf(config) && !!config.model.trim();
}

export type { ModelPrice };
