import { NextRequest, NextResponse } from 'next/server';
import { readSession, createSession, sessionFor, setSessionCookie } from '@/lib/auth';
import { brandingOf, orgs, users, verifications } from '@/lib/db';
import { loadSmtp, newCode, smtpUsable } from '@/lib/mail/config';
import { sendMail, verificationMessage } from '@/lib/mail/send';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TTL_MINUTES = 20;
const MAX_ATTEMPTS = 6;

/** Sends a code to the address the account is claiming. */
export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const account = await users.byId(session.id);
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? account.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  const taken = await users.byEmail(email);
  if (taken && taken.id !== account.id) {
    return NextResponse.json({ error: 'Another account already uses that address.' }, { status: 409 });
  }

  const smtp = await loadSmtp();
  if (!smtpUsable(smtp)) {
    // Nothing to send with: record the address and let the account through.
    await users.update(account.id, { email, emailVerifiedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, sent: false, verified: true });
  }

  const code = newCode();
  await verifications.issue({ userId: account.id, email, code, ttlMinutes: TTL_MINUTES });
  if (account.email !== email) await users.update(account.id, { email, emailVerifiedAt: null });

  const wordmark = brandingOf(await orgs.platform()).wordmark;
  try {
    await sendMail(smtp, { to: email, ...verificationMessage({ code, wordmark, minutes: TTL_MINUTES }) });
  } catch (err) {
    return NextResponse.json({
      error: `The mail server refused the message: ${(err as Error).message}`,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: true, email });
}

/** Confirms the code and marks the address verified. */
export async function PUT(req: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  const typed = String(code ?? '').trim();
  const live = await verifications.latest(session.id);
  if (!live) return NextResponse.json({ error: 'Ask for a new code first.' }, { status: 400 });
  if (new Date(live.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Ask for a new one.' }, { status: 400 });
  }
  if (live.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Ask for a new code.' }, { status: 429 });
  }
  if (typed !== live.code) {
    await verifications.countAttempt(live.id);
    return NextResponse.json({ error: 'That code does not match.' }, { status: 400 });
  }

  await verifications.consume(live.id);
  await users.update(session.id, { email: live.email, emailVerifiedAt: new Date().toISOString() });

  // The session carries the email, so mint a fresh one.
  const next = await sessionFor(session.id, session.orgId);
  if (next) setSessionCookie(await createSession(next));
  return NextResponse.json({ ok: true, role: session.role });
}
