import { NextRequest, NextResponse } from 'next/server';
import { authenticate, createSession, setSessionCookie } from '@/lib/auth';
import { callerKey, forget, take } from '@/lib/rate-limit';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ten wrong guesses a minute, counted per caller and per account name.
 *
 * Both are counted because either alone leaves a hole: limiting the caller
 * only lets a botnet spread one password across many addresses, and limiting
 * the account only lets somebody work through a list of accounts from one. A
 * successful sign-in clears the count, so a person who mistypes twice and then
 * gets it right is not held back at all.
 */
const PER_CALLER = { limit: 10, windowSec: 60 };
const PER_ACCOUNT = { limit: 10, windowSec: 300 };

export async function POST(req: NextRequest) {
  const { login, password } = await req.json().catch(() => ({}));
  if (!login || !password) return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400 });

  const caller = callerKey(req.headers, 'login');
  const account = `login-account:${String(login).trim().toLowerCase()}`;
  for (const [key, limit] of [[caller, PER_CALLER], [account, PER_ACCOUNT]] as const) {
    const verdict = take(key, limit);
    if (!verdict.ok) {
      return NextResponse.json({
        error: 'Too many sign-in attempts. Wait a minute and try again — or reset your password if you are stuck.',
        retryAfter: verdict.retryAfter,
      }, { status: 429, headers: { 'retry-after': String(verdict.retryAfter) } });
    }
  }

  const user = await authenticate(String(login), String(password));
  if (!user) return NextResponse.json({ error: 'That username or password is not correct.' }, { status: 401 });

  forget(caller);
  forget(account);
  setSessionCookie(await createSession(user));
  return NextResponse.json({ ok: true, role: user.role, orgSlug: user.orgSlug });
}
