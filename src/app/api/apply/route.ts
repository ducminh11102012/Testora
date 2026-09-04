import { NextRequest, NextResponse } from 'next/server';
import { orgApplications, orgs } from '@/lib/db';
import { loadSmtp, smtpUsable } from '@/lib/mail/config';
import { sendMail } from '@/lib/mail/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const trim = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

/**
 * A school applying for its own space. Open to the public — there is no account
 * yet — so it is written defensively: everything is length-capped, one pending
 * application per address, and three a day at most from the same address.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const application = {
    orgName: trim(body.orgName, 120),
    contactName: trim(body.contactName, 120),
    contactEmail: trim(body.contactEmail, 160).toLowerCase(),
    contactPhone: trim(body.contactPhone, 40),
    reason: trim(body.reason, 4000),
    candidates: trim(body.candidates, 60),
    website: trim(body.website, 200),
  };

  const missing = (['orgName', 'contactName', 'contactEmail', 'contactPhone', 'reason'] as const)
    .filter((key) => !application[key]);
  if (missing.length) {
    return NextResponse.json({
      error: 'Please fill in the organisation, your name, your email, a phone number and what you need the space for.',
      missing,
    }, { status: 400 });
  }
  if (!EMAIL.test(application.contactEmail)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (application.reason.length < 60) {
    return NextResponse.json({
      error: 'Please tell us a little more — a few sentences about your centre and what you will use it for '
        + '(how many candidates, which exams, when you want to start).',
    }, { status: 400 });
  }

  // Already waiting: say so rather than making a second row.
  const pending = await orgApplications.pendingFor(application.contactEmail);
  if (pending) {
    return NextResponse.json({
      ok: true,
      already: true,
      message: 'You already have an application waiting — we will be in touch at this address.',
    });
  }
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  if (await orgApplications.recentFor(application.contactEmail, dayAgo) >= 3) {
    return NextResponse.json({
      error: 'That address has applied several times today. Please wait for a reply before sending another.',
    }, { status: 429 });
  }

  const row = await orgApplications.create(application);

  // Let the administrators know, if there is a mail server to do it with.
  try {
    const smtp = await loadSmtp();
    if (smtpUsable(smtp)) {
      const platform = await orgs.platform();
      const origin = new URL(req.url).origin;
      const to = smtp.fromEmail;
      if (to) {
        await sendMail(smtp, {
          to,
          subject: `New organisation application: ${application.orgName}`,
          text: [
            `${application.contactName} has applied for a space for ${application.orgName}.`,
            '',
            `Email:  ${application.contactEmail}`,
            `Phone:  ${application.contactPhone}`,
            application.candidates ? `Candidates: ${application.candidates}` : '',
            application.website ? `Website: ${application.website}` : '',
            '',
            application.reason,
            '',
            `Review it: ${origin}/platform/applications`,
            platform ? `(${platform.name})` : '',
          ].filter(Boolean).join('\n'),
        });
      }
    }
  } catch {
    // The application is saved either way; the queue is the source of truth.
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    message: 'Thank you — your application is with the administrators. '
      + 'You will hear from them at the address you gave.',
  }, { status: 201 });
}
