import { editVault, readVault } from '../storage/vault';

/**
 * Signing in with a Hugging Face account. Two ways in, both optional:
 *
 *   OAuth   the usual redirect, for anyone with a Hub account
 *   Token   paste a personal access token, for people behind a proxy that
 *           mangles redirects, and for scripted setups
 *
 * The settings live in the encrypted object in the primary store, like every
 * other credential the platform holds.
 */
export interface HfAuthConfig {
  enabled: boolean;
  /** Paste-a-token sign-in, which works without registering an OAuth app. */
  tokenSignIn: boolean;
  clientId: string;
  /** Blank for a public app, where PKCE stands in for the secret. */
  clientSecret: string;
  /** Let a Hub account that has never been here create an account on the spot. */
  allowSignup: boolean;
  /** Extra scopes beyond `openid profile email`, space separated. */
  extraScopes: string;
}

/** The cookie that carries the OAuth state and PKCE verifier between the two hops. */
export const HF_STATE_COOKIE = 'testora_hf_state';

export const HF_AUTH_FALLBACK: HfAuthConfig = {
  enabled: false,
  tokenSignIn: false,
  clientId: '',
  clientSecret: '',
  allowSignup: true,
  extraScopes: '',
};

/** The environment can carry the application on its own, storage or no storage. */
function fromEnv(base: HfAuthConfig): HfAuthConfig {
  if (base.clientId || !process.env.HF_OAUTH_CLIENT_ID) return base;
  return {
    ...base,
    enabled: true,
    clientId: process.env.HF_OAUTH_CLIENT_ID,
    clientSecret: process.env.HF_OAUTH_CLIENT_SECRET ?? '',
  };
}

export async function loadHfAuth(): Promise<HfAuthConfig> {
  try {
    const vault = await readVault();
    const stored = (vault as unknown as { hfAuth?: Partial<HfAuthConfig> }).hfAuth ?? {};
    return fromEnv({ ...HF_AUTH_FALLBACK, ...stored });
  } catch {
    // Storage is not up yet, or is unreachable. The environment may still name
    // an application; otherwise sign-in is username and password, as always.
    return fromEnv(HF_AUTH_FALLBACK);
  }
}

export async function saveHfAuth(patch: Partial<HfAuthConfig>): Promise<HfAuthConfig> {
  await editVault((v) => {
    const current = (v as unknown as { hfAuth?: Partial<HfAuthConfig> }).hfAuth ?? {};
    (v as unknown as { hfAuth: Partial<HfAuthConfig> }).hfAuth = { ...current, ...patch };
  });
  return loadHfAuth();
}

/** What the browser may know: enough to draw the buttons, no secrets. */
export function publicHfAuth(c: HfAuthConfig) {
  return {
    oauth: c.enabled && !!c.clientId,
    token: c.enabled && c.tokenSignIn,
    allowSignup: c.allowSignup,
    clientIdSet: !!c.clientId,
    secretSet: !!c.clientSecret,
    extraScopes: c.extraScopes,
  };
}
