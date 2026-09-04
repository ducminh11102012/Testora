import { NextRequest, NextResponse } from 'next/server';
import { brandingOf, orgs, settingsOf } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.name) patch.name = String(body.name).slice(0, 120);
  if (body.branding) {
    const next = { ...brandingOf(ctx.org), ...body.branding };
    // A pasted logo arrives as a data URL; anything else must be a same-origin path.
    if (next.logoUrl && !/^(data:image\/(png|jpeg|svg\+xml|webp);|\/)/.test(next.logoUrl)) delete next.logoUrl;
    if (typeof next.logoUrl === 'string' && next.logoUrl.length > 400_000) delete next.logoUrl;
    patch.branding = JSON.stringify(next);
  }
  if (body.settings) {
    patch.settings = JSON.stringify({ ...settingsOf(ctx.org), ...body.settings });
  }

  const updated = await orgs.update(ctx.org.id, patch);
  return NextResponse.json({ ok: true, branding: brandingOf(updated) });
}
