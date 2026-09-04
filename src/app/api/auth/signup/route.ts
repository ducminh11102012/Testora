import { NextRequest, NextResponse } from 'next/server';
import { createSession, sessionFor, setSessionCookie } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { accessCodes, memberships, orgs, settingsOf, users } from '@/lib/db';
import { redeemCode } from '@/lib/redeem';
import { verificationRequired } from '@/lib/mail/config';
import { setupNeeded } from '@/lib/gate';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export async function POST(req: NextRequest) {
  if (await setupNeeded()) {
    return NextResponse.json({ error: 'This platform has no administrator yet.', setup: true }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { password, displayName, code, orgSlug } = body;
  const email = String(body.email ?? '').trim().toLowerCase();
  const wantedUsername = String(body.username ?? '').trim().toLowerCase();

  // With a mail server configured an address is compulsory, because the account
  // has to confirm a code. Without one, a username is all we ask for.
  const mailOn = await verificationRequired();

  if (mailOn && !EMAIL.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (!mailOn && !email && !USERNAME.test(wantedUsername)) {
    return NextResponse.json({
      error: 'Choose a username of 3 to 32 characters: letters, numbers, dots, dashes, underscores.',
    }, { status: 400 });
  }
  if (String(password ?? '').length < 8) {
    return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 });
  }
  if (email && await users.byEmail(email)) {
    return NextResponse.json({ error: 'An account already uses that email address.' }, { status: 409 });
  }
  if (wantedUsername && await users.byUsername(wantedUsername)) {
    return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
  }

  // A code may direct the new account into a school's space, or into the open
  // community space when it is the platform admin's code. Without one the
  // account lands in the public catalogue tenant and keeps the free bank.
  let targetOrg = orgSlug ? await orgs.bySlug(String(orgSlug)) : null;
  const typed = String(code ?? '').trim().toUpperCase();
  const joinOrg = typed ? await orgs.byJoinCode(typed) : null;
  const codeRow = typed && !joinOrg ? await accessCodes.byCode(typed) : null;
  if (typed && !joinOrg && !codeRow) {
    return NextResponse.json({ error: 'That code was not recognised.' }, { status: 400 });
  }
  if (joinOrg) targetOrg = joinOrg;
  if (codeRow?.orgId) targetOrg = await orgs.byId(codeRow.orgId) ?? targetOrg;
  const org = targetOrg ?? await orgs.platform();
  if (!org) return NextResponse.json({ error: 'The platform is not set up yet.' }, { status: 500 });

  const settings = settingsOf(org);
  if (!settings.allowSelfSignup && org.kind === 'tenant' && !codeRow) {
    return NextResponse.json({ error: 'This organisation only admits candidates by access code.' }, { status: 403 });
  }

  let username = wantedUsername || email.split('@')[0].replace(/[^a-z0-9._-]/g, '');
  if (username.length < 3) username = `user${Math.floor(Math.random() * 9000 + 1000)}`;
  while (await users.byUsername(username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;

  const user = await users.create({
    email: email || null,
    username,
    passwordHash: hashPassword(String(password)),
    displayName: String(displayName || email || username).trim(),
    credits: settings.signupCredits,
    // Without a mail server there is nothing to confirm, so the address (if the
    // candidate typed one) counts as good enough.
    emailVerifiedAt: email && !mailOn ? new Date().toISOString() : null,
  });
  await memberships.upsert(user.id, org.id, 'candidate');

  if (codeRow) {
    const result = await redeemCode(user.id, codeRow);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const session = await sessionFor(user.id, org.id);
  if (!session) return NextResponse.json({ error: 'Could not start a session.' }, { status: 500 });
  setSessionCookie(await createSession(session));
  return NextResponse.json({ ok: true, role: session.role, username, verify: mailOn });
}
