import { AccessCodeRow } from '@/types/db';
import { accessCodes, memberships, users } from './db';

export interface RedeemResult {
  ok: boolean;
  error?: string;
  credits?: number;
  testId?: string | null;
  orgId?: string | null;
}

/**
 * Applies an access code to an account: adds credits, grants entry to a
 * specific paper, and enrols the user in the issuing organisation.
 */
export function redeemCode(userId: string, code: AccessCodeRow | string): RedeemResult {
  const row = typeof code === 'string' ? accessCodes.byCode(code) : code;
  if (!row) return { ok: false, error: 'That code was not recognised.' };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'That code has expired.' };
  }
  if (row.maxUses > 0 && row.usedCount >= row.maxUses) {
    return { ok: false, error: 'That code has already been used the maximum number of times.' };
  }

  if (row.orgId && !memberships.find(userId, row.orgId)) {
    memberships.upsert(userId, row.orgId, 'candidate');
  }
  if (row.credits > 0) users.addCredits(userId, row.credits);
  accessCodes.consume(row.id);

  return { ok: true, credits: row.credits, testId: row.testId, orgId: row.orgId };
}
