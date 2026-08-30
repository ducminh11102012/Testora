import { NextRequest, NextResponse } from 'next/server';
import { createSession, sessionFor, setSessionCookie } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { accessCodes, memberships, orgs, settingsOf, users } from '@/lib/db';
import { redeemCode } from '@/lib/redeem';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const { email, password, displayName, code, orgSlug } = await req.json().catch(() => ({}));

  if (!EMAIL.test(String(email ?? ''))) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (String(password ?? '').length < 8) {
    return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 });
  }
  if (users.byEmail(String(email))) {
    return NextResponse.json({ error: 'An account already uses that email address.' }, { status: 409 });
  }

  // A code may direct the new account into a school's space; without one they
  // join the public catalogue tenant.
  let targetOrg = orgSlug ? orgs.bySlug(String(orgSlug)) : null;
  const codeRow = code ? accessCodes.byCode(String(code)) : null;
  if (code && !codeRow) return NextResponse.json({ error: 'That access code was not recognised.' }, { status: 400 });
  if (codeRow?.orgId) targetOrg = orgs.byId(codeRow.orgId) ?? targetOrg;
  const org = targetOrg ?? orgs.platform();
  if (!org) return NextResponse.json({ error: 'The platform is not set up yet.' }, { status: 500 });

  const settings = settingsOf(org);
  if (!settings.allowSelfSignup && org.kind === 'tenant' && !codeRow) {
    return NextResponse.json({ error: 'This organisation only admits candidates by access code.' }, { status: 403 });
  }

  let username = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  while (users.byUsername(username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;

  const user = users.create({
    email: String(email),
    username,
    passwordHash: hashPassword(String(password)),
    displayName: String(displayName || email).trim(),
    credits: settings.signupCredits,
  });
  memberships.upsert(user.id, org.id, 'candidate');

  if (codeRow) {
    const result = redeemCode(user.id, codeRow);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const session = sessionFor(user.id, org.id);
  if (!session) return NextResponse.json({ error: 'Could not start a session.' }, { status: 500 });
  setSessionCookie(await createSession(session));
  return NextResponse.json({ ok: true, role: session.role });
}
