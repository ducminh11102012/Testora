import { NextRequest, NextResponse } from 'next/server';
import { createSession, readSession, sessionFor, setSessionCookie } from '@/lib/auth';
import { memberships } from '@/lib/db';

/** Moves the console to another organisation the user belongs to. */
export async function POST(req: NextRequest) {
  const current = await readSession();
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orgId } = await req.json().catch(() => ({}));
  if (!current.isPlatformAdmin && !memberships.find(current.id, String(orgId))) {
    return NextResponse.json({ error: 'You are not a member of that organisation.' }, { status: 403 });
  }

  const next = sessionFor(current.id, String(orgId));
  if (!next) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  setSessionCookie(await createSession(next));
  return NextResponse.json({ ok: true, role: next.role });
}
