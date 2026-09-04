import { NextResponse } from 'next/server';
import { orgs } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reads the organisation's join code, creating one on first use. */
export async function GET() {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ ok: true, joinCode: await orgs.ensureJoinCode(ctx.org) });
}

/** Issues a new code. The old one stops working immediately. */
export async function POST() {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ ok: true, joinCode: await orgs.rotateJoinCode(ctx.org.id) });
}
