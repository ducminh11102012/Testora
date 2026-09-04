import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { OrganizationRow } from '@/types/db';
import { OrgRole } from '@/types/db';
import { memberships, orgs, users } from './db';
import { verifyPassword } from './password';
import { sessionSecret } from './session-secret';

export { hashPassword, verifyPassword, fingerprint } from './password';

const COOKIE = 'testora_session';
const secret = sessionSecret;

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  candidateRef?: string | null;
  isPlatformAdmin: boolean;
  /** The organisation whose console the user is currently looking at. */
  orgId: string;
  orgSlug: string;
  role: OrgRole;
}

/** Roles that may open the organisation console at all. */
const STAFF: OrgRole[] = ['owner', 'admin', 'teacher'];
export const isStaff = (role: OrgRole) => STAFF.includes(role);
/** Roles that may change the paper bank, members and billing. */
export const canManage = (role: OrgRole) => role === 'owner' || role === 'admin';

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      username: String(payload.username),
      email: String(payload.email ?? ''),
      displayName: String(payload.displayName),
      candidateRef: (payload.candidateRef as string) ?? null,
      isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      orgId: String(payload.orgId),
      orgSlug: String(payload.orgSlug),
      role: (payload.role as OrgRole) ?? 'candidate',
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

/**
 * Builds the session payload for a user, defaulting to the organisation where
 * they hold the strongest role (staff before candidate) so signing in lands a
 * teacher in their console and a learner in the catalogue.
 */
export async function sessionFor(userId: string, preferOrgId?: string): Promise<SessionUser | null> {
  const user = await users.byId(userId);
  if (!user) return null;

  const list = await memberships.of(user.id);
  const rank: Record<OrgRole, number> = { owner: 0, admin: 1, teacher: 2, candidate: 3 };
  const chosen =
    (preferOrgId && list.find((m) => m.orgId === preferOrgId)) ||
    [...list].sort((a, b) => rank[a.role] - rank[b.role])[0];

  const org: OrganizationRow | null = chosen ? await orgs.byId(chosen.orgId) : await orgs.platform();
  if (!org) return null;

  return {
    id: user.id,
    username: user.username,
    email: user.email ?? '',
    displayName: user.displayName,
    candidateRef: user.candidateRef,
    isPlatformAdmin: !!user.isPlatformAdmin,
    orgId: org.id,
    orgSlug: org.slug,
    role: chosen?.role ?? 'candidate',
  };
}

export async function authenticate(login: string, password: string): Promise<SessionUser | null> {
  const user = await users.byLogin(login);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return sessionFor(user.id);
}

/** Every org-scoped query goes through this so a stale cookie cannot cross tenants. */
export async function assertMember(session: SessionUser, orgId: string): Promise<boolean> {
  if (session.isPlatformAdmin) return true;
  return !!await memberships.find(session.id, orgId);
}
