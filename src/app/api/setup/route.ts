import { NextRequest, NextResponse } from 'next/server';
import { createSession, sessionFor, setSessionCookie } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { memberships, orgs, users } from '@/lib/db';
import { setupNeeded } from '@/lib/gate';
import { DEFAULT_BRANDING } from '@/lib/defaults';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

/**
 * The first account on a fresh deployment.
 *
 * The check is deliberately narrow: **an administrator existing** closes this
 * route, not the wider "setup needed" state. Those are not the same thing —
 * setup is also "needed" when storage is unconfigured, and storage lives in a
 * file on the local disk, which on a serverless host is empty again after every
 * deployment. Gating on that would have reopened account creation to anybody
 * who visited the site after a redeploy.
 */
export async function POST(req: NextRequest) {
  if ((await users.platformAdminCount()) > 0) {
    return NextResponse.json({ error: 'This platform is already set up.' }, { status: 409 });
  }
  if (!(await setupNeeded())) {
    return NextResponse.json({ error: 'This platform is already set up.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName ?? '').trim();
  const username = String(body.username ?? '').trim().toLowerCase();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const platformName = String(body.platformName ?? '').trim() || DEFAULT_BRANDING.wordmark;

  if (!displayName) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  if (!USERNAME.test(username)) {
    return NextResponse.json({
      error: 'The username can use letters, numbers, dots, dashes and underscores, 3 to 32 characters.',
    }, { status: 400 });
  }
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: 'Choose a password of at least 10 characters.' }, { status: 400 });
  }
  if (await users.byUsername(username)) {
    return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
  }

  // The two organisations every deployment needs: the branded platform tenant,
  // and the open community space whose join code the administrator hands out.
  const platform = (await orgs.platform()) ?? await orgs.create({
    slug: 'public', name: platformName, kind: 'platform', joinCode: 'TESTORA',
    branding: { wordmark: platformName },
  });
  const community = (await orgs.community()) ?? await orgs.create({
    slug: 'community', name: `${platformName} Community`, kind: 'community', joinCode: 'COMMON',
    branding: { wordmark: `${platformName} Community`, tagline: 'Open practice' },
  });

  const admin = await users.create({
    email: email || null,
    username,
    passwordHash: hashPassword(password),
    displayName,
    isPlatformAdmin: true,
    // The founder's own address counts as verified: they typed it here.
    emailVerifiedAt: email ? new Date().toISOString() : null,
  });
  await memberships.upsert(admin.id, platform.id, 'owner');
  await memberships.upsert(admin.id, community.id, 'owner');

  const session = await sessionFor(admin.id, platform.id);
  if (!session) return NextResponse.json({ error: 'Could not start a session.' }, { status: 500 });
  setSessionCookie(await createSession(session));
  return NextResponse.json({ ok: true, joinCode: community.joinCode });
}
