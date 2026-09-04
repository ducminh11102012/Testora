'use client';

import { useMemo, useState } from 'react';
import { Stat } from '../ui/Shell';

interface Paper {
  id: string; title: string; module: string; possible: number; attempts: number; mean: number;
  scores: number[]; hardest: { number: number; missed: number; rate: number }[];
}
interface Candidate {
  name: string; email: string; cohort: string; paper: string; sitting: string;
  score: number; band: number | null; submittedAt: string | null;
}

/** Ten equal buckets across the mark range; enough shape to read at a glance. */
function histogram(scores: number[], possible: number) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    from: Math.round((possible * i) / 10),
    to: Math.round((possible * (i + 1)) / 10),
    n: 0,
  }));
  for (const s of scores) {
    const idx = Math.min(9, Math.floor((s / Math.max(1, possible)) * 10));
    buckets[idx].n += 1;
  }
  return buckets;
}

export default function ReportsView({
  papers, candidates, orgName,
}: { papers: Paper[]; candidates: Candidate[]; orgName: string }) {
  const [paperId, setPaperId] = useState(papers[0]?.id ?? '');
  const paper = papers.find((p) => p.id === paperId) ?? papers[0];
  const cohorts = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.cohort).filter(Boolean))).sort(),
    [candidates],
  );
  const [cohort, setCohort] = useState('');

  const filtered = candidates.filter((c) => (!cohort || c.cohort === cohort));

  /*
   * The file comes from the server rather than being assembled here: this page
   * only holds what it could draw, the server holds every result, and it also
   * gets the two details a spreadsheet needs and a browser download does not —
   * a byte-order mark, so Excel reads Vietnamese names correctly, and a guard
   * against a name that begins with "=" being run as a formula.
   */
  function exportCsv() {
    window.location.href = '/api/admin/reports/export';
  }

  if (!paper) {
    return (
      <div className="px-[34px] py-[34px]">
        <h1 className="text-[32px] font-semibold mb-[10px]">Reports</h1>
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">Reports appear once candidates have submitted.</p>
      </div>
    );
  }

  const bars = histogram(paper.scores, paper.possible);
  const peak = Math.max(1, ...bars.map((b) => b.n));

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <div className="flex items-center justify-between gap-[16px] mb-[24px] flex-wrap">
        <h1 className="text-[32px] font-semibold">Reports</h1>
        <button type="button" onClick={exportCsv}
                className="px-[20px] h-[46px] border border-[color:var(--line-strong)] rounded-[4px] text-[17px]">
          Export results as CSV
        </button>
      </div>

      <div className="flex gap-[14px] flex-wrap mb-[26px]">
        <label className="block">
          <span className="block text-[14px] font-semibold mb-[6px]">Paper</span>
          <select value={paperId} onChange={(e) => setPaperId(e.target.value)} className="admin-input w-auto">
            {papers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        {cohorts.length > 0 && (
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Class</span>
            <select value={cohort} onChange={(e) => setCohort(e.target.value)} className="admin-input w-auto">
              <option value="">All classes</option>
              {cohorts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-[12px] sm:grid-cols-4 mb-[30px]">
        <Stat label="Attempts" value={paper.attempts} />
        <Stat label="Mean score" value={`${paper.mean} / ${paper.possible}`} />
        <Stat label="Highest" value={Math.max(0, ...paper.scores)} />
        <Stat label="Lowest" value={paper.scores.length ? Math.min(...paper.scores) : 0} />
      </div>

      <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[20px]">
        <h2 className="text-[20px] font-semibold mb-[16px]">Score distribution</h2>
        <div className="flex items-end gap-[8px] h-[180px]">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-[8px]">
              <span className="text-[13px] tabular-nums text-[color:var(--paper-ink-3)]">{b.n || ''}</span>
              <div
                className="w-full rounded-t-[3px]"
                style={{ height: `${(b.n / peak) * 130}px`, background: 'var(--brand)', minHeight: b.n ? 4 : 0 }}
                title={`${b.from}–${b.to} marks: ${b.n} candidate(s)`}
              />
              <span className="text-[12px] text-[color:var(--paper-ink-3)] tabular-nums">{b.from}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[26px]">
        <h2 className="text-[20px] font-semibold mb-[14px]">Most-missed questions</h2>
        {paper.hardest.length === 0 ? (
          <p className="text-[16px] text-[color:var(--paper-ink-3)]">Everyone got everything right.</p>
        ) : (
          <ul className="space-y-[10px]">
            {paper.hardest.map((h) => (
              <li key={h.number} className="flex items-center gap-[14px]">
                <span className="w-[54px] text-[16px] font-semibold tabular-nums">Q{h.number}</span>
                <span className="flex-1 h-[10px] rounded-full bg-[#f0f0f0] overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${h.rate}%`, background: 'var(--bad)' }} />
                </span>
                <span className="w-[130px] text-right text-[15px] text-[color:var(--paper-ink-3)] tabular-nums">
                  {h.rate}% missed it
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="text-[22px] font-semibold mb-[12px]">Candidates</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[color:var(--line)]">
              <th className="py-[10px] font-semibold">Candidate</th>
              <th className="py-[10px] font-semibold w-[130px]">Class</th>
              <th className="py-[10px] font-semibold">Paper</th>
              <th className="py-[10px] font-semibold w-[90px]">Score</th>
              <th className="py-[10px] font-semibold w-[80px]">Band</th>
              <th className="py-[10px] font-semibold w-[170px]">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i} className="border-b border-[color:var(--line)]">
                <td className="py-[10px]">{c.name}</td>
                <td className="py-[10px] text-[color:var(--paper-ink-3)]">{c.cohort || '—'}</td>
                <td className="py-[10px]">{c.paper}</td>
                <td className="py-[10px] tabular-nums">{c.score}</td>
                <td className="py-[10px] tabular-nums">{c.band ?? '—'}</td>
                <td className="py-[10px] text-[color:var(--paper-ink-3)]">
                  {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
