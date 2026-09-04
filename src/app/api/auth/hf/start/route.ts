import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { sessionSecret } from '@/lib/session-secret';
import { HF_STATE_COOKIE, loadHfAuth } from '@/lib/auth-hf/config';
import { STORAGE_SCOPES, authorizeUrl, pkce } from '@/lib/auth-hf/oauth';
import { users } from '@/lib/db';
import { readSession } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends the visitor to the Hub with a fresh state and PKCE challenge.
 *
 * Two intents come through here. `signin` is somebody signing in. `storage`
 * is a member of staff connecting a Hugging Face account so the platform can
 * create the dataset repository and write papers to it — the same redirect,
 * asking for repository scopes as well.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const intent = url.searchParams.get('intent') === 'storage' ? 'storage' : 'signin';
  const owner = url.searchParams.get('owner') ?? 'platform';   // platform | org | root
  const visibility = url.searchParams.get('visibility') === 'public' ? 'public' : 'private';
  const repo = (url.searchParams.get('repo') ?? '').trim();

  const config = await loadHfAuth();
  const clientId = config.clientId || process.env.HF_OAUTH_CLIENT_ID || '';

  if (intent === 'storage') {
    // Connecting storage is a staff job, except during the first run when
    // there is no account to be staff of yet.
    const user = await readSession();
    // A first run is "nobody has claimed this platform yet", which only the
    // database can answer: the storage file is gone after every redeploy.
    const firstRun = (await users.platformAdminCount()) === 0;
    const allowed = firstRun || user?.isPlatformAdmin || (owner === 'org' && user && user.role !== 'candidate');
    if (!allowed) return NextResponse.redirect(new URL('/login?reason=auth', req.url));
    if (!clientId) return NextResponse.redirect(new URL('/platform/sign-in?reason=no-client', req.url));
  } else if (!config.enabled || !clientId) {
    return NextResponse.redirect(new URL('/login?reason=hf-off', req.url));
  }

  const redirectUri = new URL('/api/auth/hf/callback', req.url).toString();
  const state = randomBytes(16).toString('base64url');
  const { verifier, challenge } = pkce();

  const ticket = await new SignJWT({ state, verifier, redirectUri, intent, owner, visibility, repo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(sessionSecret());

  const res = NextResponse.redirect(authorizeUrl({
    clientId,
    redirectUri,
    state,
    challenge,
    extraScopes: intent === 'storage'
      ? `${config.extraScopes} ${STORAGE_SCOPES}`.trim()
      : config.extraScopes,
  }));
  res.cookies.set(HF_STATE_COOKIE, ticket, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600,
  });
  return res;
}
