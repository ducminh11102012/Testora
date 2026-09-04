import { NextRequest, NextResponse } from 'next/server';
import { SuiteItem, suites, tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { DEFAULT_VIDEOS } from '@/lib/videos';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ suites: await suites.listOrg(ctx.org.id) });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  if (!body.title) return NextResponse.json({ error: 'Give the test a name.' }, { status: 400 });

  const items: SuiteItem[] = (Array.isArray(body.items) ? body.items : [])
    .filter((i: { skill: string }) => SKILLS.includes(i.skill as never))
    .map((i: Partial<SuiteItem>) => ({
      skill: i.skill as SuiteItem['skill'],
      testId: i.mode === 'offline' ? null : (i.testId || null),
      durationMin: Number(i.durationMin) || 60,
      videoUrl: i.videoUrl || DEFAULT_VIDEOS[i.skill as string] || undefined,
      mode: i.mode === 'offline' ? 'offline' : 'online',
    }));

  if (!items.length) return NextResponse.json({ error: 'Add at least one section.' }, { status: 400 });
  for (const item of items) {
    if (item.mode === 'online' && !item.testId) {
      return NextResponse.json({ error: `Choose a paper for the ${item.skill} section.` }, { status: 400 });
    }
    if (item.testId) {
      const paper = await tests.byId(item.testId);
      if (!paper || paper.orgId !== ctx.org.id) {
        return NextResponse.json({ error: 'That paper is not in your bank.' }, { status: 400 });
      }
    }
  }

  const suite = await suites.create({
    orgId: ctx.org.id,
    title: String(body.title),
    kind: body.kind === 'general' ? 'general' : 'ielts',
    description: String(body.description ?? ''),
    status: body.status === 'published' ? 'published' : 'draft',
    visibility: body.visibility === 'catalog' ? 'catalog' : 'private',
    priceCredits: Number(body.priceCredits) || 0,
    items,
    folder: body.folder ? String(body.folder).trim().slice(0, 80) : null,
    settings: {
      allowPractice: body.allowPractice !== false,
      allowSimulation: body.allowSimulation !== false,
      practiceMaxMinutes: Math.max(0, Math.min(600, Math.round(Number(body.practiceMaxMinutes) || 0))),
    },
  });
  return NextResponse.json({ ok: true, id: suite.id });
}
