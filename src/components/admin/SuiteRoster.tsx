'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SKILL_LABEL } from '@/lib/band-descriptors';
import type { SkillName } from '@/lib/db';
import { Pill } from '../ui/Shell';

interface RosterRow {
  userId: string; name: string; email: string;
  bands: Record<string, number | null>;
  offlineSkills: string[];
  complete: boolean; overall: number | null; released: boolean;
}

/** Bands a person can enter by hand, in half steps, as an examiner would. */
const BAND_CHOICES = Array.from({ length: 19 }, (_, i) => i / 2);

export default function SuiteRoster({
  suiteId, roster, skills, offlineSkills,
}: {
  suiteId: string; roster: RosterRow[]; skills: SkillName[]; offlineSkills: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setBand(userId: string, skill: string, value: string) {
    setBusy(userId);
    await fetch(`/api/admin/suites/${suiteId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, bands: { [skill]: Number(value) } }),
    });
    setBusy(null);
    router.refresh();
  }

  async function release(userId: string) {
    setBusy(userId);
    await fetch(`/api/admin/suites/${suiteId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, release: true }),
    });
    setBusy(null);
    router.refresh();
  }

  if (!roster.length) {
    return <p className="text-[18px] text-[color:var(--paper-ink-3)]">Nobody has started this test yet.</p>;
  }

  return (
    <>
      <h2 className="text-[22px] font-semibold mb-[14px]">Candidates</h2>
      {offlineSkills.length > 0 && (
        <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[16px] max-w-[70ch]">
          {offlineSkills.map((s) => SKILL_LABEL[s as SkillName]).join(' and ')} is sat with an examiner —
          enter the band here and it joins the candidate&rsquo;s report.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[color:var(--line)]">
              <th className="py-[10px] font-semibold">Candidate</th>
              {skills.map((s) => <th key={s} className="py-[10px] font-semibold w-[140px]">{SKILL_LABEL[s]}</th>)}
              <th className="py-[10px] font-semibold w-[100px]">Overall</th>
              <th className="py-[10px] font-semibold w-[200px]">Report</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.userId} className="border-b border-[color:var(--line)]">
                <td className="py-[12px]">
                  <div>{r.name}</div>
                  <div className="text-[14px] text-[color:var(--paper-ink-3)]">{r.email}</div>
                </td>
                {skills.map((s) => (
                  <td key={s} className="py-[12px]">
                    {r.offlineSkills.includes(s) ? (
                      <select
                        className="admin-input w-auto"
                        value={r.bands[s] ?? ''}
                        disabled={busy === r.userId}
                        onChange={(e) => setBand(r.userId, s, e.target.value)}
                        aria-label={`${SKILL_LABEL[s]} band for ${r.name}`}
                      >
                        <option value="">—</option>
                        {BAND_CHOICES.map((b) => <option key={b} value={b}>{b.toFixed(1)}</option>)}
                      </select>
                    ) : (
                      <span className="tabular-nums text-[17px]">
                        {r.bands[s] === null || r.bands[s] === undefined ? '—' : r.bands[s]!.toFixed(1)}
                      </span>
                    )}
                  </td>
                ))}
                <td className="py-[12px] tabular-nums text-[18px] font-semibold">
                  {r.overall === null ? '—' : r.overall.toFixed(1)}
                </td>
                <td className="py-[12px]">
                  <div className="flex items-center gap-[12px] flex-wrap">
                    {r.released ? <Pill tone="good">Released</Pill> : <Pill tone="warn">Held</Pill>}
                    {!r.released && r.complete && (
                      <button type="button" onClick={() => release(r.userId)} disabled={busy === r.userId}
                              className="underline text-[15px]">Release</button>
                    )}
                    <Link href={`/suite/${suiteId}/report?candidate=${r.userId}`} className="underline text-[15px]">
                      Open
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
