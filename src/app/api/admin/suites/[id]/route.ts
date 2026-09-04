import { NextRequest, NextResponse } from 'next/server';
import { suiteResults, suiteSettingsOf, suites, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { ExamContent } from '@/types/exam';
import { preflight } from '@/lib/preflight';

const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const suite = await suites.byId(params.id);
  if (!suite || !await sameOrg(ctx, suite.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // A band entered for a section sat with an examiner, e.g. speaking.
  if (body.bands && body.userId) {
    const current = await suiteResults.find(suite.id, String(body.userId));
    const merged = { ...(current ? JSON.parse(current.manualBands) : {}) };
    for (const [skill, value] of Object.entries(body.bands as Record<string, unknown>)) {
      const band = Number(value);
      if (Number.isFinite(band) && band >= 0 && band <= 9) merged[skill] = Math.round(band * 2) / 2;
    }
    await suiteResults.setBands(suite.id, String(body.userId), merged);
    return NextResponse.json({ ok: true, bands: merged });
  }

  if (body.release && body.userId) {
    await suiteResults.release(suite.id, String(body.userId));
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  for (const key of ['title', 'description', 'status'] as const) {
    if (body[key] !== undefined) patch[key] = String(body[key]);
  }
  if (body.visibility !== undefined) {
    // A full test is listed like a paper: kept to the organisation, or put in
    // the public catalogue for anyone to sit.
    const allowed = ['private', 'catalog'];
    if (!allowed.includes(String(body.visibility))) {
      return NextResponse.json({ error: 'A full test is either private or in the catalogue.' }, { status: 400 });
    }
    patch.visibility = String(body.visibility);
  }
  if (body.priceCredits !== undefined) patch.priceCredits = Number(body.priceCredits) || 0;
  /*
   * A section points at a paper, so the papers have to be this organisation's —
   * the same check the create route makes. Without it a full test could be
   * pointed at another tenant's paper, and its candidates would sit it.
   */
  if (body.items) {
    const items = (Array.isArray(body.items) ? body.items : []) as Array<{
      skill?: string; testId?: string | null; mode?: string; durationMin?: number; videoUrl?: string;
    }>;
    if (!items.length) {
      return NextResponse.json({ error: 'A full test needs at least one section.' }, { status: 400 });
    }
    for (const item of items) {
      if (!SKILLS.includes(String(item.skill) as never)) {
        return NextResponse.json({ error: `“${item.skill}” is not one of the skills.` }, { status: 400 });
      }
      if (item.mode === 'offline') continue;
      if (!item.testId) {
        return NextResponse.json({ error: `Choose a paper for the ${item.skill} section.` }, { status: 400 });
      }
      const paper = await tests.byId(String(item.testId));
      if (!paper || !await sameOrg(ctx, paper.orgId)) {
        return NextResponse.json({ error: 'That paper is not in your bank.' }, { status: 400 });
      }
    }
    patch.items = JSON.stringify(items.map((item) => ({
      skill: item.skill,
      testId: item.mode === 'offline' ? null : (item.testId ?? null),
      durationMin: Math.max(0, Math.round(Number(item.durationMin) || 0)),
      videoUrl: item.videoUrl || undefined,
      mode: item.mode === 'offline' ? 'offline' : 'online',
    })));
  }
  if (body.folder !== undefined) {
    const folder = String(body.folder ?? '').trim().slice(0, 80);
    patch.folder = folder || null;
  }

  // How it may be sat: a rehearsal of one section, the whole thing properly, or
  // both. A centre running mocks can switch practice off.
  if (body.settings) {
    const current = suiteSettingsOf(suite);
    const next = {
      ...current,
      ...(body.settings.allowPractice !== undefined ? { allowPractice: !!body.settings.allowPractice } : {}),
      ...(body.settings.allowSimulation !== undefined ? { allowSimulation: !!body.settings.allowSimulation } : {}),
      ...(body.settings.practiceMaxMinutes !== undefined
        ? { practiceMaxMinutes: Math.max(0, Math.min(600, Math.round(Number(body.settings.practiceMaxMinutes) || 0))) }
        : {}),
    };
    if (!next.allowPractice && !next.allowSimulation) {
      return NextResponse.json({
        error: 'A test nobody may sit is not a test. Leave practice or the full simulation switched on.',
      }, { status: 400 });
    }
    patch.settings = JSON.stringify(next);
  }

  /*
   * Publishing a full test means candidates can start it, so every section it
   * points at has to be sittable: a draft paper or a listening paper with no
   * recording would strand them at the first section.
   */
  const publishing = patch.status === 'published' || (patch.visibility === 'catalog' && suite.status === 'published');
  if (publishing) {
    const items = body.items ? (body.items as { skill: string; testId: string | null; mode: string }[]) : suites.itemsOf(suite);
    const problems: string[] = [];
    for (const item of items) {
      if (item.mode === 'offline' || !item.testId) continue;
      const paper = await tests.byId(item.testId);
      if (!paper) { problems.push(`the ${item.skill} paper is missing`); continue; }
      if (paper.status !== 'published') { problems.push(`“${paper.title}” is still a draft`); continue; }
      const content = JSON.parse(paper.content) as ExamContent;
      // The same checklist the paper's own publish enforces: a full test is
      // only as sittable as the papers it points at.
      const report = preflight(content);
      if (report.blocking.length) {
        problems.push(`“${paper.title}” — ${report.blocking[0].message.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
    if (problems.length) {
      return NextResponse.json({
        error: `This test cannot go live yet: ${problems.join(', ')}.`,
        problems,
      }, { status: 409 });
    }
  }

  await suites.update(suite.id, patch);
  return NextResponse.json({ ok: true });
}

/**
 * Deleting a full test leaves its papers and the attempts already sat alone —
 * only the grouping goes. Candidates part-way through lose the hub, so a test
 * anybody has started needs confirming.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const suite = await suites.byId(params.id);
  if (!suite || !await sameOrg(ctx, suite.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sat = await suites.attemptCount(suite.id);
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (sat > 0 && !force) {
    return NextResponse.json({
      error: `${sat} section${sat === 1 ? '' : 's'} of this test ${sat === 1 ? 'has' : 'have'} been sat. `
        + 'The papers and those results stay; only the full test disappears. Confirm to delete it.',
      needsConfirmation: true,
      attempts: sat,
    }, { status: 409 });
  }

  await suites.remove(suite.id);
  return NextResponse.json({ ok: true });
}
