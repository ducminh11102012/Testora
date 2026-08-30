import { NextRequest, NextResponse } from 'next/server';
import { attempts } from '@/lib/db';
import { readSession } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attempt = attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ error: 'This attempt is closed.' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  if (body.answers) patch.answers = JSON.stringify(body.answers);
  if (body.annotations) patch.annotations = JSON.stringify(body.annotations);
  if (body.flags) patch.flags = JSON.stringify(body.flags);
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  attempts.update(attempt.id, patch);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
