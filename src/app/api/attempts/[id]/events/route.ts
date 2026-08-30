import { NextRequest, NextResponse } from 'next/server';
import { attempts, events } from '@/lib/db';
import { readSession } from '@/lib/auth';

const ALLOWED = new Set(['focus-lost', 'focus-regained', 'paste-blocked', 'fullscreen-exit', 'resumed']);

/** Invigilation trail. Written by the exam client, read by the console. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attempt = attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { type, meta } = await req.json().catch(() => ({}));
  if (!ALLOWED.has(String(type))) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });

  events.add(attempt.id, String(type), (meta && typeof meta === 'object') ? meta : {});
  return NextResponse.json({ ok: true });
}
