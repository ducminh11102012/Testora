'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';
import DeleteButton from './DeleteButton';

interface SessionRow {
  id: string; name: string; code: string; status: string;
  /** The paper or full test this sitting opens. */
  opens: string; isSuite: boolean;
  opensAt: string | null; closesAt: string | null; durationMin: number; attempts: number;
  settings: Record<string, boolean | number>;
}

const SECURITY = [
  ['blockCopyPaste', 'Block copy and paste'],
  ['blockRightClick', 'Take away the right-click menu'],
  ['trackFocusLoss', 'Record when a candidate leaves the window'],
  ['requireFullscreen', 'Ask for full screen, and record every exit'],
  ['lockPartOnLeave', 'Lock each part once the candidate moves on'],
  ['singleAttempt', 'One attempt per candidate'],
] as const;

const RESULTS = [
  ['releaseResultsImmediately', 'Show the score as soon as they submit'],
  ['showAnswers', 'Show which answers were right'],
] as const;

export default function SessionManager({
  sessions, papers, fullTests,
}: {
  sessions: SessionRow[];
  papers: { id: string; title: string; durationMin: number }[];
  /** Published full tests, which can be scheduled just like a paper. */
  fullTests: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    /** `test:<id>` or `suite:<id>` — one dropdown for both kinds. */
    opens: papers[0] ? `test:${papers[0].id}` : (fullTests[0] ? `suite:${fullTests[0].id}` : ''),
    name: '', opensAt: '', closesAt: '', durationMin: 0,
    blockCopyPaste: true, blockRightClick: true, trackFocusLoss: true, requireFullscreen: false,
    lockPartOnLeave: false, singleAttempt: false,
    releaseResultsImmediately: true, showAnswers: true,
    maxFocusLoss: 0,
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(form.opens.startsWith('suite:')
          ? { suiteId: form.opens.slice('suite:'.length) }
          : { testId: form.opens.slice('test:'.length) }),
        name: form.name || undefined,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : null,
        durationMin: form.durationMin,
        settings: {
          blockCopyPaste: form.blockCopyPaste,
          blockRightClick: form.blockRightClick,
          trackFocusLoss: form.trackFocusLoss,
          requireFullscreen: form.requireFullscreen,
          lockPartOnLeave: form.lockPartOnLeave,
          singleAttempt: form.singleAttempt,
          releaseResultsImmediately: form.releaseResultsImmediately,
          showAnswers: form.showAnswers,
          maxFocusLoss: form.maxFocusLoss,
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
          disabled={papers.length === 0 && fullTests.length === 0}
          className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {open ? 'Cancel' : 'Schedule a sitting'}
        </button>
      </div>

      {papers.length === 0 && fullTests.length === 0 && (
        <p className="text-[17px] mb-[20px]">
          Publish a paper or a full test first — only published ones can be scheduled.
        </p>
      )}

      {open && (
        <form onSubmit={create} className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[26px]">
          <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">What they sit</span>
              <select className="admin-input" value={form.opens}
                      onChange={(e) => setForm((f) => ({ ...f, opens: e.target.value }))}>
                {fullTests.length > 0 && (
                  <optgroup label="Full tests — sat skill by skill">
                    {fullTests.map((u) => <option key={u.id} value={`suite:${u.id}`}>{u.title}</option>)}
                  </optgroup>
                )}
                {papers.length > 0 && (
                  <optgroup label="Single papers">
                    {papers.map((p) => <option key={p.id} value={`test:${p.id}`}>{p.title}</option>)}
                  </optgroup>
                )}
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
            <label className="flex items-center gap-[10px] text-[16px] mt-[10px]">
              Hand the paper in after
              <input
                type="number" min={0} max={20} className="admin-input w-[86px]"
                value={form.maxFocusLoss}
                onChange={(e) => setForm((f) => ({ ...f, maxFocusLoss: Number(e.target.value) }))}
              />
              departures from the window (0 = never)
            </label>
          </fieldset>

          <fieldset className="mt-[18px]">
            <legend className="text-[14px] font-semibold mb-[8px]">What the candidate sees afterwards</legend>
            <div className="grid gap-[8px] sm:grid-cols-2">
              {RESULTS.map(([key, label]) => (
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
            <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[8px]">
              With the score held back, the candidate sees only that the paper was handed in until
              you release the sitting&rsquo;s results.
            </p>
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
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">No sittings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[color:var(--line)]">
                <th className="py-[10px] font-semibold">Sitting</th>
                <th className="py-[10px] font-semibold w-[130px]">Code</th>
                <th className="py-[10px] font-semibold w-[120px]">Status</th>
                <th className="py-[10px] font-semibold w-[190px]">Window</th>
                <th className="py-[10px] font-semibold w-[100px]">Sat</th>
                <th className="py-[10px] w-[300px]" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-[color:var(--line)]">
                  <td className="py-[12px]">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[14px] text-[color:var(--paper-ink-3)]">
                      {s.opens}
                      {s.isSuite && <span className="ml-[8px] font-semibold">· full test</span>}
                    </div>
                  </td>
                  <td className="py-[12px]">
                    <span className="font-mono text-[18px] tracking-[0.12em]">{s.code}</span>
                  </td>
                  <td className="py-[12px]">
                    <Pill tone={s.status === 'open' ? 'good' : s.status === 'closed' ? 'bad' : 'neutral'}>{s.status}</Pill>
                  </td>
                  <td className="py-[12px] text-[14px] text-[color:var(--paper-ink-3)]">
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
                      <button type="button" onClick={() => setStatus(s.id, 'closed')} className="underline">Close</button>
                    )}
                    <DeleteButton url={`/api/admin/sessions/${s.id}`} what={`the sitting “${s.name}”`} />
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
