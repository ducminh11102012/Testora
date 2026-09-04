import { NextRequest, NextResponse } from 'next/server';
import { attempts, events } from '@/lib/db';
import { readSession } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'focus-lost', 'focus-regained', 'paste-blocked', 'copy-blocked', 'context-menu-blocked',
  'fullscreen-exit', 'fullscreen-entered', 'resumed', 'auto-submit',
  // When a recording was started. Read back on load so a reload cannot wind a
  // once-only tape back to the beginning.
  'audio-start',
]);

/** Invigilation trail. Written by the exam client, read by the console. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The light read: this route never looks at the paper itself.
  const attempt = await attempts.guard(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { type, meta } = await req.json().catch(() => ({}));
  if (!ALLOWED.has(String(type))) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });

  await events.add(attempt.id, String(type), (meta && typeof meta === 'object') ? meta : {});
  return NextResponse.json({ ok: true });
}
