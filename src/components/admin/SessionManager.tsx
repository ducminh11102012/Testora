'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';

interface SessionRow {
  id: string; name: string; code: string; testTitle: string; status: string;
  opensAt: string | null; closesAt: string | null; durationMin: number; attempts: number;
  settings: Record<string, boolean>;
}

const SECURITY = [
  ['blockCopyPaste', 'Block copy and paste'],
  ['trackFocusLoss', 'Record when a candidate leaves the window'],
  ['lockPartOnLeave', 'Lock each part once the candidate moves on'],
  ['releaseResultsImmediately', 'Show the result as soon as they submit'],
] as const;

export default function SessionManager({
  sessions, papers,
}: {
  sessions: SessionRow[];
  papers: { id: string; title: string; durationMin: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    testId: papers[0]?.id ?? '', name: '', opensAt: '', closesAt: '', durationMin: 0,
    blockCopyPaste: true, trackFocusLoss: true, lockPartOnLeave: false, releaseResultsImmediately: true,
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        testId: form.testId,
        name: form.name || undefined,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : null,
        durationMin: form.durationMin,
        settings: {
          blockCopyPaste: form.blockCopyPaste,
          trackFocusLoss: form.trackFocusLoss,
          lockPartOnLeave: form.lockPartOnLeave,
          releaseResultsImmediately: form.releaseResultsImmediately,
        },
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'The sitting could not be created.'); return; }
    setOpen(false);
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/sessions/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <div className="flex items-center justify-between mb-[26px]">
        <h1 className="text-[32px] font-semibold">Sittings</h1>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={papers.length === 0}
          className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {open ? 'Cancel' : 'Schedule a sitting'}
        </button>
      </div>

      {papers.length === 0 && (
        <p className="text-[17px] mb-[20px]">
          Publish a paper first — only published papers can be scheduled.
        </p>
      )}

      {open && (
        <form onSubmit={create} className="border border-[#dcdcdc] rounded-[6px] p-[22px] mb-[26px]">
          <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Paper</span>
              <select className="admin-input" value={form.testId}
                      onChange={(e) => setForm((f) => ({ ...f, testId: e.target.value }))}>
                {papers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Name shown to candidates</span>
              <input className="admin-input" value={form.name} placeholder="Mock exam — class 10A"
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Duration override (0 = use the paper&apos;s)</span>
              <input type="number" min={0} className="admin-input" value={form.durationMin}
                     onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Opens</span>
              <input type="datetime-local" className="admin-input" value={form.opensAt}
                     onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Closes</span>
              <input type="datetime-local" className="admin-input" value={form.closesAt}
                     onChange={(e) => setForm((f) => ({ ...f, closesAt: e.target.value }))} />
            </label>
          </div>

          <fieldset className="mt-[18px]">
            <legend className="text-[14px] font-semibold mb-[8px]">Invigilation</legend>
            <div className="grid gap-[8px] sm:grid-cols-2">
              {SECURITY.map(([key, label]) => (
                <label key={key} className="flex items-center gap-[10px] text-[16px]">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="mt-[12px] text-[16px] text-[color:var(--bad)]">{error}</p>}

          <button type="submit" disabled={busy}
                  className="mt-[18px] px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                  style={{ background: 'var(--brand)' }}>
            {busy ? 'Creating…' : 'Create sitting'}
          </button>
        </form>
      )}

      {sessions.length === 0 ? (
        <p className="text-[18px] text-[#5e5e5e]">No sittings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[#dcdcdc]">
                <th className="py-[10px] font-semibold">Sitting</th>
                <th className="py-[10px] font-semibold w-[130px]">Code</th>
                <th className="py-[10px] font-semibold w-[120px]">Status</th>
                <th className="py-[10px] font-semibold w-[190px]">Window</th>
                <th className="py-[10px] font-semibold w-[100px]">Sat</th>
                <th className="py-[10px] w-[220px]" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-[#f2f2f2]">
                  <td className="py-[12px]">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[14px] text-[#5e5e5e]">{s.testTitle}</div>
                  </td>
                  <td className="py-[12px]">
                    <span className="font-mono text-[18px] tracking-[0.12em]">{s.code}</span>
                  </td>
                  <td className="py-[12px]">
                    <Pill tone={s.status === 'open' ? 'good' : s.status === 'closed' ? 'bad' : 'neutral'}>{s.status}</Pill>
                  </td>
                  <td className="py-[12px] text-[14px] text-[#5e5e5e]">
                    {s.opensAt ? new Date(s.opensAt).toLocaleString() : 'any time'}
                    <br />
                    {s.closesAt ? new Date(s.closesAt).toLocaleString() : 'no close'}
                  </td>
                  <td className="py-[12px] tabular-nums">{s.attempts}</td>
                  <td className="py-[12px] text-right space-x-[12px]">
                    <Link href={`/admin/sessions/${s.id}`} className="underline">Monitor</Link>
                    {s.status !== 'open' && (
                      <button type="button" onClick={() => setStatus(s.id, 'open')} className="underline">Open</button>
                    )}
                    {s.status !== 'closed' && (
                      <button type="button" onClick={() => setStatus(s.id, 'closed')} className="underline text-[color:var(--bad)]">Close</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
