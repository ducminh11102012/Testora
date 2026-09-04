import { OrgApplicationRow, memberships, orgApplications, orgs, users } from './db';
import { hashPassword } from './password';
import { loadSmtp, smtpUsable } from './mail/config';
import { sendMail } from './mail/send';

/**
 * A school asking for a space of its own.
 *
 * Anyone may apply; nobody gets an organisation without a platform
 * administrator saying yes. Approval is the only thing that creates the
 * organisation, its owner account and the credentials — and the credentials are
 * shown to the administrator once, because a deployment with no mail server
 * still has to be able to hand them over.
 */

export interface Approval {
  application: OrgApplicationRow;
  orgId: string;
  slug: string;
  username: string;
  /** Shown once. Not stored anywhere in readable form. */
  password: string;
  emailed: boolean;
  emailError?: string;
}

/** A readable slug that is not already taken. */
async function freeSlug(name: string): Promise<string> {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'school';
  let slug = base;
  let n = 1;
  while (await orgs.bySlug(slug)) { n += 1; slug = `${base}-${n}`; }
  return slug;
}

/** A username derived from the contact's email, again avoiding collisions. */
async function freeUsername(email: string): Promise<string> {
  const base = (email.split('@')[0] || 'owner').toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'owner';
  let username = base;
  let n = 1;
  while (await users.byUsername(username)) { n += 1; username = `${base}${n}`; }
  return username;
}

/** Twelve readable characters — no look-alikes, easy to read down a phone. */
export function newPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Approves an application: creates the organisation, its owner, and the
 * membership that ties them together. Idempotent enough to be safe on a double
 * click — an application that already has an organisation is returned as it is.
 */
export async function approveApplication(input: {
  application: OrgApplicationRow;
  reviewerId: string;
  note?: string;
  origin?: string;
}): Promise<Approval> {
  const { application } = input;
  if (application.orgId) {
    const existing = await orgs.byId(application.orgId);
    if (existing) {
      return {
        application,
        orgId: existing.id,
        slug: existing.slug,
        username: '(already created)',
        password: '',
        emailed: false,
      };
    }
  }

  const slug = await freeSlug(application.orgName);
  const org = await orgs.create({ slug, name: application.orgName, kind: 'tenant' });

  const username = await freeUsername(application.contactEmail);
  const password = newPassword();
  const owner = await users.create({
    email: application.contactEmail,
    username,
    passwordHash: hashPassword(password),
    displayName: application.contactName || application.orgName,
  });
  await memberships.upsert(owner.id, org.id, 'owner');

  const updated = await orgApplications.update(application.id, {
    status: 'approved',
    note: input.note ?? application.note,
    reviewedBy: input.reviewerId,
    reviewedAt: new Date().toISOString(),
    orgId: org.id,
  });

  // Tell them, if there is a mail server. If there is not, the administrator
  // passes the credentials on themselves — which is why they are returned.
  let emailed = false;
  let emailError: string | undefined;
  try {
    const smtp = await loadSmtp();
    if (smtpUsable(smtp)) {
      const where = input.origin ? `${input.origin}/login` : 'the sign-in page';
      await sendMail(smtp, {
        to: application.contactEmail,
        subject: `${application.orgName} — your exam space is ready`,
        text: [
          `Hello ${application.contactName || application.orgName},`,
          '',
          `Your application for ${application.orgName} has been approved.`,
          '',
          `Sign in at: ${where}`,
          `Username: ${username}`,
          `Password: ${password}`,
          '',
          'Please change the password after signing in. You can then add your teachers,',
          'import your papers and schedule your first sitting.',
          input.note ? `\nA note from the administrator: ${input.note}` : '',
        ].join('\n'),
      });
      emailed = true;
    }
  } catch (err) {
    emailError = (err as Error).message;
  }

  return {
    application: updated ?? application,
    orgId: org.id,
    slug,
    username,
    password,
    emailed,
    emailError,
  };
}

/** Declines an application, with the reason kept for the record. */
export async function declineApplication(input: {
  application: OrgApplicationRow;
  reviewerId: string;
  note: string;
  origin?: string;
}): Promise<{ emailed: boolean; emailError?: string }> {
  await orgApplications.update(input.application.id, {
    status: 'declined',
    note: input.note,
    reviewedBy: input.reviewerId,
    reviewedAt: new Date().toISOString(),
  });

  let emailed = false;
  let emailError: string | undefined;
  try {
    const smtp = await loadSmtp();
    if (smtpUsable(smtp) && input.note.trim()) {
      await sendMail(smtp, {
        to: input.application.contactEmail,
        subject: `${input.application.orgName} — about your application`,
        text: [
          `Hello ${input.application.contactName || input.application.orgName},`,
          '',
          'Thank you for applying. We are not able to open a space for you at the moment.',
          '',
          input.note.trim(),
        ].join('\n'),
      });
      emailed = true;
    }
  } catch (err) {
    emailError = (err as Error).message;
  }
  return { emailed, emailError };
}
