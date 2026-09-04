import { NextRequest, NextResponse } from 'next/server';
import { attempts } from '@/lib/db';
import { readSession } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The light read: this route never looks at the paper itself.
  const attempt = await attempts.guard(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ error: 'This attempt is closed.' }, { status: 409 });

  // The clock belongs to the server. A few seconds of slack cover the last
  // autosave that was already in flight when time ran out; anything later is
  // refused, so a paused laptop cannot be used to keep writing.
  const GRACE_MS = 10_000;
  if (new Date(attempt.endsAt).getTime() + GRACE_MS < Date.now()) {
    return NextResponse.json({ error: 'Time is up for this paper.', expired: true }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  if (body.answers) patch.answers = JSON.stringify(body.answers);
  if (body.annotations) patch.annotations = JSON.stringify(body.annotations);
  if (body.flags) patch.flags = JSON.stringify(body.flags);
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  await attempts.update(attempt.id, patch);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
