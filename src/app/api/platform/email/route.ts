import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs } from '@/lib/db';
import { SmtpConfig, loadSmtp, publicSmtp, saveSmtp } from '@/lib/mail/config';
import { sendMail, verificationMessage, verifySmtp } from '@/lib/mail/send';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const user = await readSession();
  if (!user?.isPlatformAdmin) return null;
  return user;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ config: publicSmtp(await loadSmtp()) });
}

export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  const patch: Partial<SmtpConfig> & { password?: string } = {
    enabled: !!body.enabled,
    host: String(body.host ?? '').trim(),
    port: Math.min(65535, Math.max(1, Number(body.port) || 587)),
    secure: !!body.secure,
    user: String(body.user ?? '').trim(),
    fromEmail: String(body.fromEmail ?? '').trim(),
    fromName: String(body.fromName ?? '').trim(),
    requireVerification: body.requireVerification !== false,
  };
  if (typeof body.password === 'string' && body.password) patch.password = body.password;

  return NextResponse.json({ ok: true, config: publicSmtp(await saveSmtp(patch)) });
}

/** Checks the connection, and optionally puts a real message through it. */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { to } = await req.json().catch(() => ({}));
  const config = await loadSmtp();
  try {
    await verifySmtp(config);
    if (to) {
      const wordmark = brandingOf(await orgs.platform()).wordmark;
      await sendMail(config, {
        to: String(to),
        ...verificationMessage({ code: '123456', wordmark, minutes: 20 }),
        subject: `Test message from ${wordmark}`,
      });
      return NextResponse.json({ ok: true, message: `Sent a test message to ${to}.` });
    }
    return NextResponse.json({ ok: true, message: 'The mail server accepted the connection.' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
