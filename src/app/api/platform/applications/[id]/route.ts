import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { orgApplications } from '@/lib/db';
import { approveApplication, declineApplication } from '@/lib/apply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const user = await readSession();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return user;
}

/** Approve or decline one application. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const application = await orgApplications.byId(params.id);
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (application.status !== 'pending') {
    return NextResponse.json({ error: `This application was already ${application.status}.` }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const note = String(body.note ?? '').trim().slice(0, 2000);
  const origin = new URL(req.url).origin;

  if (body.action === 'approve') {
    const result = await approveApplication({ application, reviewerId: user.id, note, origin });
    return NextResponse.json({
      ok: true,
      orgId: result.orgId,
      slug: result.slug,
      username: result.username,
      password: result.password,
      emailed: result.emailed,
      emailError: result.emailError,
    });
  }

  if (body.action === 'decline') {
    if (!note) {
      return NextResponse.json({ error: 'Say why, so the applicant can be told something useful.' }, { status: 400 });
    }
    const result = await declineApplication({ application, reviewerId: user.id, note, origin });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

/** Removes an application from the queue once it has been dealt with. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const application = await orgApplications.byId(params.id);
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (application.status === 'pending') {
    return NextResponse.json({ error: 'Approve or decline it first.' }, { status: 409 });
  }
  await orgApplications.remove(params.id);
  return NextResponse.json({ ok: true });
}
