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
export async function redeemCode(userId: string, code: AccessCodeRow | string): Promise<RedeemResult> {
  const row = typeof code === 'string' ? await accessCodes.byCode(code) : code;
  if (!row) return { ok: false, error: 'That code was not recognised.' };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'That code has expired.' };
  }
  if (row.maxUses > 0 && row.usedCount >= row.maxUses) {
    return { ok: false, error: 'That code has already been used the maximum number of times.' };
  }

  /*
   * Claim the use first. The check above is only there to give a good message:
   * two people redeeming a one-use code at the same moment both pass it, and
   * only the statement that increments the count under its own condition can
   * settle which of them actually gets the credits.
   */
  if (!await accessCodes.claim(row.id)) {
    return { ok: false, error: 'That code has already been used the maximum number of times.' };
  }

  if (row.orgId && !await memberships.find(userId, row.orgId)) {
    await memberships.upsert(userId, row.orgId, 'candidate');
  }
  if (row.credits > 0) await users.addCredits(userId, row.credits);

  return { ok: true, credits: row.credits, testId: row.testId, orgId: row.orgId };
}
