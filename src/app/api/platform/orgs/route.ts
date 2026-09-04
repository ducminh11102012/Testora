import { NextRequest, NextResponse } from 'next/server';
import { memberships, orgs } from '@/lib/db';
import { readSession } from '@/lib/auth';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export async function GET() {
  const user = await readSession();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({
    orgs: await Promise.all((await orgs.list()).map(async (o) => ({ ...o, members: await orgs.memberCount(o.id) }))),
  });
}

/** Provisions a B2B tenant and makes the requesting admin its owner. */
export async function POST(req: NextRequest) {
  const user = await readSession();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, slug, plan } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: 'Give the organisation a name.' }, { status: 400 });

  let candidate = slugify(String(slug || name));
  if (!candidate) return NextResponse.json({ error: 'That name cannot be turned into a web address.' }, { status: 400 });
  while (await orgs.bySlug(candidate)) candidate = `${candidate}-${Math.floor(Math.random() * 90 + 10)}`;

  const org = await orgs.create({ slug: candidate, name: String(name), kind: 'tenant', plan: plan || 'starter' });
  await memberships.upsert(user.id, org.id, 'owner');
  return NextResponse.json({ ok: true, id: org.id, slug: org.slug });
}
