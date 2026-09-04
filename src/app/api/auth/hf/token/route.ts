import { NextRequest, NextResponse } from 'next/server';
import { loadHfAuth } from '@/lib/auth-hf/config';
import { profileFromToken } from '@/lib/auth-hf/oauth';
import { signInWithHf } from '@/lib/auth-hf/link';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign in by pasting a Hugging Face access token. Useful where a redirect
 * cannot come back — a closed network, a kiosk — and for scripted setup.
 * The token is used once to identify the account and is never stored.
 */
export async function POST(req: NextRequest) {
  const config = await loadHfAuth();
  if (!config.enabled || !config.tokenSignIn) {
    return NextResponse.json({ error: 'Token sign-in is switched off.' }, { status: 403 });
  }

  const { token } = await req.json().catch(() => ({}));
  const value = String(token ?? '').trim();
  if (!value) return NextResponse.json({ error: 'Paste your access token.' }, { status: 400 });

  try {
    const profile = await profileFromToken(value);
    const outcome = await signInWithHf(profile, config);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 403 });
    return NextResponse.json({ ok: true, role: outcome.role, created: outcome.created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
