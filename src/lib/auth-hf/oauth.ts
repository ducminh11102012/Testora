import { createHash, randomBytes } from 'node:crypto';

/**
 * The OAuth 2.0 / OIDC flow documented at https://huggingface.co/docs/hub/oauth.
 * PKCE is used every time: it costs nothing and it is what makes a public app
 * (one with no client secret) safe.
 */

const HOST = process.env.HF_ENDPOINT || 'https://huggingface.co';

export const AUTHORIZE_URL = `${HOST}/oauth/authorize`;
export const TOKEN_URL = `${HOST}/oauth/token`;
export const USERINFO_URL = `${HOST}/oauth/userinfo`;

export interface Pkce { verifier: string; challenge: string }

export function pkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(input: {
  clientId: string; redirectUri: string; state: string; challenge: string; extraScopes?: string;
}): string {
  const scope = ['openid', 'profile', 'email', ...(input.extraScopes ?? '').split(/\s+/).filter(Boolean)];
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: Array.from(new Set(scope)).join(' '),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface HfProfile {
  sub: string;
  name: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  picture: string | null;
}

export interface TokenGrant {
  accessToken: string;
  /** Hub tokens expire — eight hours at the time of writing. */
  expiresAt: string | null;
  scope: string;
}

export async function exchangeCode(input: {
  code: string; redirectUri: string; verifier: string; clientId: string; clientSecret?: string;
}): Promise<TokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    client_id: input.clientId,
  });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (input.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`;
  }

  const res = await fetch(TOKEN_URL, { method: 'POST', headers, body, cache: 'no-store' });
  if (!res.ok) throw new Error(`The Hub refused the code (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { access_token?: string; expires_in?: number; scope?: string };
  if (!data.access_token) throw new Error('The Hub returned no access token.');
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scope: data.scope ?? '',
  };
}

/**
 * Scopes for connecting storage. `contribute-repos` lets the platform create
 * the dataset and write to the ones it created; `write-repos` covers a
 * repository the account already has.
 */
export const STORAGE_SCOPES = 'contribute-repos write-repos';

export async function profileFromToken(accessToken: string): Promise<HfProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  if (res.ok) {
    const d = await res.json() as Record<string, unknown>;
    return {
      sub: String(d.sub ?? ''),
      name: String(d.name ?? d.preferred_username ?? ''),
      username: String(d.preferred_username ?? d.name ?? ''),
      email: d.email ? String(d.email) : null,
      emailVerified: d.email_verified === true,
      picture: d.picture ? String(d.picture) : null,
    };
  }

  // A personal access token is not an OAuth token, so userinfo turns it down.
  // whoami-v2 answers for both, and is what the token sign-in path uses.
  const who = await fetch(`${HOST}/api/whoami-v2`, {
    headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  if (!who.ok) throw new Error(`The token was refused (${who.status}).`);
  const d = await who.json() as { id?: string; name?: string; fullname?: string; email?: string; avatarUrl?: string };
  if (!d.name) throw new Error('The token did not identify an account.');
  return {
    sub: String(d.id ?? d.name),
    name: String(d.fullname ?? d.name),
    username: String(d.name),
    email: d.email ? String(d.email) : null,
    emailVerified: !!d.email,
    picture: d.avatarUrl ? String(d.avatarUrl) : null,
  };
}
