import { NextResponse } from 'next/server';
import { SessionUser, canManage, isStaff, readSession } from './auth';
import { memberships, orgs } from './db';
import { OrganizationRow } from '@/types/db';

export interface StaffContext { user: SessionUser; org: OrganizationRow }

/** Route guard: a member of staff acting inside their own organisation. */
export async function staffContext(level: 'staff' | 'manage' = 'staff'):
Promise<StaffContext | NextResponse> {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = level === 'manage' ? canManage(user.role) : isStaff(user.role);
  if (!allowed && !user.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const org = await orgs.byId(user.orgId);
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
  return { user, org };
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

/**
 * Guards a row that carries an orgId so one tenant cannot reach another's.
 *
 * The caller is acting as staff of the organisation they signed into, so that
 * is the organisation whose rows they may touch. Belonging to a second
 * organisation is not enough: a teacher at one school is very often a candidate
 * at another, and accepting any membership handed them staff powers there —
 * including deleting that school's papers and the results with them. To act as
 * staff elsewhere they switch organisation, which reissues the session with the
 * role they actually hold there.
 */
export async function sameOrg(ctx: StaffContext, orgId: string): Promise<boolean> {
  if (ctx.org.id === orgId) return true;
  if (ctx.user.isPlatformAdmin) return true;
  const elsewhere = await memberships.find(ctx.user.id, orgId);
  return !!elsewhere && isStaff(elsewhere.role);
}
