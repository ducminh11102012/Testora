import { imports } from '../db';
import { ImportRow } from '@/types/db';
import { deleteObject } from './client';
import { retentionHoursFor } from './buckets';
import { bucketById } from './vault';

/**
 * The rule the product promises: an uploaded Word or PDF file exists only for
 * as long as the organisation says it should. Zero hours means it is deleted
 * the moment parsing finishes; the parsed questions stay, the file does not.
 */

/** When this upload's stored copy should disappear, or null to keep it. */
export async function expiryFor(orgId: string, from = new Date()): Promise<string | null> {
  const hours = await retentionHoursFor(orgId);
  if (hours < 0) return null;
  return new Date(from.getTime() + hours * 3_600_000).toISOString();
}

/** Deletes the stored file for one import and records that it is gone. */
export async function purgeImport(record: Pick<ImportRow, 'id' | 'storageKey' | 'storedIn'>): Promise<boolean> {
  if (!record.storageKey) return false;
  let ids: string[] = [];
  try { ids = JSON.parse(record.storedIn || '[]') as string[]; } catch { ids = []; }

  const rows = (await Promise.all(ids.map((id) => bucketById(id))))
    .filter((r): r is NonNullable<typeof r> => !!r);
  // Never mark a file gone unless every copy of it actually went. Losing the
  // key while the object survives would orphan it beyond any later sweep.
  if (!rows.length) return false;
  const results = await deleteObject(rows, record.storageKey);
  if (results.some((r) => !r.ok)) return false;

  await imports.update(record.id, {
    storageKey: null, storedIn: '[]', expiresAt: null, purgedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Deletes everything past its expiry. Called by the scheduled job, and again
 * whenever a member of staff opens the import screen, so a deployment with no
 * cron still cleans up.
 */
export async function sweepExpired(limit = 50): Promise<number> {
  const due = await imports.expired(limit);
  let done = 0;
  for (const record of due) {
    try { if (await purgeImport(record)) done += 1; } catch { /* try again next sweep */ }
  }
  return done;
}
