import { redirect } from 'next/navigation';
import { SessionUser, isStaff, readSession } from './auth';
import { brandingOf, orgs, settingsOf } from './db';
import { Branding, OrgSettings, OrganizationRow } from '@/types/db';

export interface OrgContext {
  user: SessionUser;
  org: OrganizationRow;
  branding: Branding;
  settings: OrgSettings;
}

/** Page guard: any signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');
  return user;
}

/** Page guard: a member of staff in the organisation they are looking at. */
export async function requireStaff(): Promise<OrgContext> {
  const user = await requireUser();
  if (!isStaff(user.role) && !user.isPlatformAdmin) redirect('/dashboard');
  const org = await orgs.byId(user.orgId);
  if (!org) redirect('/dashboard');
  return { user, org, branding: brandingOf(org), settings: settingsOf(org) };
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect('/dashboard');
  return user;
}

/** Branding for pages with no signed-in user, e.g. the public catalogue. */
export async function platformBranding(): Promise<Branding> {
  return brandingOf(await orgs.platform());
}
