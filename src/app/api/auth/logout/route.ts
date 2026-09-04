import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
