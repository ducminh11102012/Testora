'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';

interface Person {
  membershipId: string; id: string; displayName: string; email: string; username: string;
  candidateRef: string | null; role: string; cohort: string | null; credits: number; attempts: number;
}

export default function PeopleManager({ people, orgName }: { people: Person[]; orgName: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'one' | 'bulk'>('one');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [one, setOne] = useState({
    email: '', password: '', displayName: '', candidateRef: '', role: 'candidate', cohort: '',
  });
  const [bulk, setBulk] = useState({ rows: '', defaultPassword: 'exam1234' });

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch('/api/admin/people', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(one),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Could not add that person.'); return; }
    setMessage(`Added. Their username is ${data.username}.`);
    setOne({ email: '', password: '', displayName: '', candidateRef: '', role: 'candidate', cohort: '' });
    router.refresh();
  }

  async function addBulk(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const rows = bulk.rows.split('\n').map((r) => r.trim()).filter(Boolean);
    const res = await fetch('/api/admin/people', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows, defaultPassword: bulk.defaultPassword }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Import failed.'); return; }
    setMessage(`Enrolled ${data.created} candidate(s).${data.skipped?.length ? ` ${data.skipped.length} line(s) skipped.` : ''}`);
    setBulk({ ...bulk, rows: '' });
    router.refresh();
  }

  async function remove(membershipId: string) {
    await fetch('/api/admin/people', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipId }),
    });
    router.refresh();
  }

  const shown = people.filter((p) =>
    !filter || `${p.displayName} ${p.email} ${p.cohort ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">People</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[26px]">Everyone with access to {orgName}.</p>

      <div className="border border-[#dcdcdc] rounded-[6px] mb-[28px]">
        <div className="flex border-b border-[#e4e4e4]">
          {(['one', 'bulk'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-[20px] py-[12px] text-[16px] ${tab === t ? 'font-semibold border-b-2 border-black' : 'text-[#5e5e5e]'}`}
            >
              {t === 'one' ? 'Add one person' : 'Enrol a class'}
            </button>
          ))}
        </div>

        <div className="p-[22px]">
          {tab === 'one' ? (
            <form onSubmit={addOne} className="grid gap-[12px] sm:grid-cols-3">
              <input required className="admin-input" placeholder="Email" value={one.email}
                     onChange={(e) => setOne({ ...one, email: e.target.value })} />
              <input className="admin-input" placeholder="Full name" value={one.displayName}
                     onChange={(e) => setOne({ ...one, displayName: e.target.value })} />
              <input className="admin-input" placeholder="Password (new accounts only)" value={one.password}
                     onChange={(e) => setOne({ ...one, password: e.target.value })} />
              <input className="admin-input" placeholder="Candidate number" value={one.candidateRef}
                     onChange={(e) => setOne({ ...one, candidateRef: e.target.value })} />
              <input className="admin-input" placeholder="Class" value={one.cohort}
                     onChange={(e) => setOne({ ...one, cohort: e.target.value })} />
              <select className="admin-input" value={one.role} onChange={(e) => setOne({ ...one, role: e.target.value })}>
                <option value="candidate">Candidate</option>
                <option value="teacher">Teacher (can mark and schedule)</option>
                <option value="admin">Admin (can edit papers and people)</option>
                <option value="owner">Owner</option>
              </select>
              <div className="sm:col-span-3">
                <button type="submit" disabled={busy}
                        className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                        style={{ background: 'var(--brand)' }}>
                  {busy ? 'Adding…' : 'Add'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={addBulk}>
              <label className="block mb-[12px]">
                <span className="block text-[14px] font-semibold mb-[6px]">
                  One candidate per line: name, email, class
                </span>
                <textarea
                  className="admin-input h-[160px] font-mono text-[14px]"
                  placeholder={'Nguyen Van A, a.nguyen@school.edu.vn, 10A1\nTran Thi B, b.tran@school.edu.vn, 10A1'}
                  value={bulk.rows}
                  onChange={(e) => setBulk({ ...bulk, rows: e.target.value })}
                />
              </label>
              <label className="block mb-[14px] max-w-[280px]">
                <span className="block text-[14px] font-semibold mb-[6px]">Password for new accounts</span>
                <input className="admin-input" value={bulk.defaultPassword}
                       onChange={(e) => setBulk({ ...bulk, defaultPassword: e.target.value })} />
              </label>
              <button type="submit" disabled={busy}
                      className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                      style={{ background: 'var(--brand)' }}>
                {busy ? 'Enrolling…' : 'Enrol'}
              </button>
            </form>
          )}

          {error && <p className="mt-[12px] text-[16px] text-[color:var(--bad)]">{error}</p>}
          {message && <p className="mt-[12px] text-[16px] text-[color:var(--good)]">{message}</p>}
        </div>
      </div>

      <input
        className="admin-input max-w-[360px] mb-[16px]"
        placeholder="Filter by name, email or class"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[#dcdcdc]">
              <th className="py-[10px] font-semibold">Name</th>
              <th className="py-[10px] font-semibold">Email</th>
              <th className="py-[10px] font-semibold w-[150px]">Candidate no.</th>
              <th className="py-[10px] font-semibold w-[110px]">Class</th>
              <th className="py-[10px] font-semibold w-[120px]">Role</th>
              <th className="py-[10px] font-semibold w-[90px]">Credits</th>
              <th className="py-[10px] font-semibold w-[90px]">Attempts</th>
              <th className="py-[10px] w-[80px]" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.membershipId} className="border-b border-[#f2f2f2]">
                <td className="py-[11px]">{p.displayName}</td>
                <td className="py-[11px] text-[#5e5e5e]">{p.email}</td>
                <td className="py-[11px]">{p.candidateRef ?? '—'}</td>
                <td className="py-[11px]">{p.cohort ?? '—'}</td>
                <td className="py-[11px]">
                  <Pill tone={p.role === 'candidate' ? 'neutral' : 'brand'}>{p.role}</Pill>
                </td>
                <td className="py-[11px] tabular-nums">{p.credits}</td>
                <td className="py-[11px] tabular-nums">{p.attempts}</td>
                <td className="py-[11px] text-right">
                  <button type="button" onClick={() => remove(p.membershipId)}
                          className="underline text-[color:var(--bad)] text-[15px]">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
