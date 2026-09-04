import { NextRequest, NextResponse } from 'next/server';
import { isResponse, staffContext } from '@/lib/api-guard';
import { ASSEMBLE_ORDER, AssembleSkill, assembleSuites, bankSummary } from '@/lib/assemble';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the bank holds, and how many full tests could be built from it. */
export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ bank: await bankSummary(ctx.org.id) });
}

/**
 * Draws full tests out of the bank. A centre that has uploaded a book gets its
 * mocks in one click: five different tests, each a different set of papers,
 * published to the candidates as soon as they are built.
 */
export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const skills = Array.isArray(body.skills)
    ? (body.skills as string[]).filter((s): s is AssembleSkill => ASSEMBLE_ORDER.includes(s as AssembleSkill))
    : undefined;

  const result = await assembleSuites({
    orgId: ctx.org.id,
    count: Number(body.count) || 1,
    skills,
    titlePrefix: body.titlePrefix ? String(body.titlePrefix) : undefined,
    folder: body.folder ? String(body.folder).trim().slice(0, 80) : undefined,
    publish: body.publish !== false,
    visibility: body.visibility === 'catalog' ? 'catalog' : 'private',
    settings: {
      allowPractice: body.allowPractice !== false,
      allowSimulation: body.allowSimulation !== false,
    },
  });

  if (!result.built.length) {
    return NextResponse.json({ error: result.warnings.join(' '), bank: result.summary }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    built: result.built.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    warnings: result.warnings,
    bank: result.summary,
  });
}
