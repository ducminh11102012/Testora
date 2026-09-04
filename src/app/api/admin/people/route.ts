import { NextRequest, NextResponse } from 'next/server';
import { memberships, users } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { hashPassword } from '@/lib/password';
import { OrgRole } from '@/types/db';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES: OrgRole[] = ['owner', 'admin', 'teacher', 'candidate'];

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({
    people: await Promise.all((await memberships.listOrg(ctx.org.id)).map(async ({ passwordHash, ...rest }) => ({
      ...rest, attempts: await users.attemptCount(rest.id),
    }))),
  });
}

/** Adds a person to this organisation, creating the account when new. */
export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const { email, password, displayName, role, candidateRef, cohort } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: 'An email address is required.' }, { status: 400 });
  const wanted: OrgRole = ROLES.includes(role) ? role : 'candidate';

  let user = await users.byEmail(String(email));
  if (!user) {
    if (!password || String(password).length < 6) {
      return NextResponse.json({ error: 'Set a password of at least 6 characters for the new account.' }, { status: 400 });
    }
    let username = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    while (await users.byUsername(username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;
    user = await users.create({
      email: String(email),
      username,
      passwordHash: hashPassword(String(password)),
      displayName: String(displayName || email),
      candidateRef: candidateRef || null,
    });
  } else if (candidateRef) {
    /*
     * The account already exists and belongs to somebody who may well be at
     * another school as well. Enrolling them here is the point of this route;
     * renaming them is not, so the candidate number is only set when they do
     * not have one — otherwise one centre's enrolment would rewrite the
     * number another centre prints on its exam papers.
     */
    if (!user.candidateRef) {
      await users.update(user.id, { candidateRef: String(candidateRef) });
    } else if (user.candidateRef !== String(candidateRef)) {
      const membership = await memberships.find(user.id, ctx.org.id);
      // Their own organisation may correct it; a new one may not.
      if (membership) await users.update(user.id, { candidateRef: String(candidateRef) });
    }
  }

  await memberships.upsert(user.id, ctx.org.id, wanted, cohort ? String(cohort) : null);
  return NextResponse.json({ id: user.id, username: user.username });
}

/** Bulk enrolment: one candidate per line, `name, email[, class]`. */
export async function PUT(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const { rows, defaultPassword } = await req.json().catch(() => ({}));
  if (!Array.isArray(rows)) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });

  const created: string[] = [];
  const skipped: string[] = [];
  for (const line of rows as string[]) {
    const [name, email, cohort] = String(line).split(',').map((s) => s.trim());
    if (!email || !email.includes('@')) { skipped.push(line); continue; }
    let user = await users.byEmail(email);
    if (!user) {
      let username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
      while (await users.byUsername(username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;
      user = await users.create({
        email, username,
        passwordHash: hashPassword(String(defaultPassword || 'exam1234')),
        displayName: name || email,
      });
    }
    await memberships.upsert(user.id, ctx.org.id, 'candidate', cohort || null);
    created.push(email);
  }
  return NextResponse.json({ ok: true, created: created.length, skipped });
}

export async function DELETE(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const { membershipId } = await req.json().catch(() => ({}));
  const list = await memberships.listOrg(ctx.org.id);
  if (!list.some((m) => m.membershipId === membershipId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await memberships.remove(String(membershipId));
  return NextResponse.json({ ok: true });
}
