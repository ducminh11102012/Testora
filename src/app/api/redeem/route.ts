import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { redeemCode } from '@/lib/redeem';
import { sittings } from '@/lib/db';

/** One box on the Join page accepts both sitting codes and credit codes. */
export async function POST(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Sign in first, then enter your code.' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  const value = String(code ?? '').trim().toUpperCase();
  if (!value) return NextResponse.json({ error: 'Enter a code.' }, { status: 400 });

  const sitting = sittings.byCode(value);
  if (sitting) return NextResponse.json({ ok: true, kind: 'sitting', sittingId: sitting.id, testTitle: sitting.testTitle });

  const result = redeemCode(user.id, value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, kind: 'credit', credits: result.credits, testId: result.testId });
}
