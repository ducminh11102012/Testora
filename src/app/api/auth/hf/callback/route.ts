import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sessionSecret } from '@/lib/session-secret';
import { HF_STATE_COOKIE, loadHfAuth } from '@/lib/auth-hf/config';
import { exchangeCode, profileFromToken } from '@/lib/auth-hf/oauth';
import { signInWithHf } from '@/lib/auth-hf/link';
import { connectHfStorage } from '@/lib/auth-hf/connect-storage';
import { readSession } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Comes back from the Hub with a code; leaves with a session. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fail = (reason: string) => {
    const to = new URL('/login', req.url);
    to.searchParams.set('reason', 'hf-failed');
    to.searchParams.set('detail', reason.slice(0, 160));
    const res = NextResponse.redirect(to);
    res.cookies.delete(HF_STATE_COOKIE);
    return res;
  };

  const denied = url.searchParams.get('error');
  if (denied) return fail(url.searchParams.get('error_description') || denied);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const ticket = req.cookies.get(HF_STATE_COOKIE)?.value;
  if (!code || !state || !ticket) return fail('The sign-in attempt had expired. Try again.');

  let payload: {
    state?: string; verifier?: string; redirectUri?: string;
    intent?: string; owner?: string; visibility?: string; repo?: string;
  };
  try {
    payload = (await jwtVerify(ticket, sessionSecret())).payload as typeof payload;
  } catch {
    return fail('The sign-in attempt could not be verified. Try again.');
  }
  if (payload.state !== state) return fail('That sign-in did not match the one that started here.');

  const config = await loadHfAuth();
  const clientId = config.clientId || process.env.HF_OAUTH_CLIENT_ID || '';
  const forStorage = payload.intent === 'storage';
  if (!clientId) return fail('No Hugging Face application is configured.');
  if (!forStorage && !config.enabled) return fail('Hugging Face sign-in is switched off.');

  try {
    const grant = await exchangeCode({
      code,
      redirectUri: payload.redirectUri!,
      verifier: payload.verifier!,
      clientId,
      clientSecret: config.clientSecret || undefined,
    });
    const profile = await profileFromToken(grant.accessToken);

    // Connecting storage rather than signing in: create the dataset and keep
    // the token against it.
    if (forStorage) {
      const session = await readSession();
      const owner = payload.owner === 'root'
        ? 'root' as const
        : payload.owner === 'org' && session
          ? { orgId: session.orgId }
          : 'platform' as const;
      const result = await connectHfStorage({
        profile,
        accessToken: grant.accessToken,
        expiresAt: grant.expiresAt,
        owner,
        visibility: payload.visibility === 'public' ? 'public' : 'private',
        repo: payload.repo ?? '',
      });

      const to = new URL(
        result.created === 'root' ? '/setup'
          : owner === 'platform' ? '/platform/storage' : '/admin/storage',
        req.url,
      );
      to.searchParams.set('connected', result.repoId);
      const res = NextResponse.redirect(to);
      res.cookies.delete(HF_STATE_COOKIE);
      return res;
    }

    const outcome = await signInWithHf(profile, config);
    if (!outcome.ok) return fail(outcome.error);

    const to = new URL(outcome.role === 'candidate' ? '/dashboard' : '/admin', req.url);
    const res = NextResponse.redirect(to);
    res.cookies.delete(HF_STATE_COOKIE);
    return res;
  } catch (err) {
    return fail((err as Error).message);
  }
}
