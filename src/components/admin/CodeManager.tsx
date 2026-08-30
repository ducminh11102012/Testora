'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccessCodeRow } from '@/types/db';

export default function CodeManager({
  codes, papers,
}: { codes: AccessCodeRow[]; papers: { id: string; title: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ quantity: 10, credits: 1, maxUses: 1, testId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<string[]>([]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/codes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setBatch(data.codes ?? []); router.refresh(); }
  }

  async function remove(id: string) {
    await fetch('/api/admin/codes', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  function copyBatch() {
    void navigator.clipboard?.writeText(batch.join('\n'));
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1140px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">Access codes</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[26px] max-w-[70ch]">
        A code adds credits to a candidate&apos;s account and enrols them in this organisation. Hand them
        out on paper, or send them with a joining email — candidates enter them at <code>/join</code>.
      </p>

      <form onSubmit={create} className="border border-[#dcdcdc] rounded-[6px] p-[22px] mb-[26px]">
        <div className="grid gap-[12px] sm:grid-cols-5">
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">How many</span>
            <input type="number" min={1} max={200} className="admin-input" value={form.quantity}
                   onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Credits each</span>
            <input type="number" min={0} className="admin-input" value={form.credits}
                   onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Uses per code</span>
            <input type="number" min={1} className="admin-input" value={form.maxUses}
                   onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Tie to a paper</span>
            <select className="admin-input" value={form.testId}
                    onChange={(e) => setForm({ ...form, testId: e.target.value })}>
              <option value="">Any paper</option>
              {papers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Note</span>
            <input className="admin-input" value={form.note} placeholder="Class 10A1"
                   onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
        <button type="submit" disabled={busy}
                className="mt-[16px] px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                style={{ background: 'var(--brand)' }}>
          {busy ? 'Generating…' : 'Generate codes'}
        </button>
      </form>

      {batch.length > 0 && (
        <div className="border border-[#dcdcdc] rounded-[6px] p-[22px] mb-[26px]">
          <div className="flex items-center justify-between mb-[12px]">
            <h2 className="text-[19px] font-semibold">{batch.length} new codes</h2>
            <button type="button" onClick={copyBatch} className="underline text-[16px]">Copy all</button>
          </div>
          <div className="grid gap-[6px] sm:grid-cols-4 font-mono text-[16px]">
            {batch.map((c) => <span key={c}>{c}</span>)}
          </div>
        </div>
      )}

      {codes.length === 0 ? (
        <p className="text-[18px] text-[#5e5e5e]">No codes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[#dcdcdc]">
                <th className="py-[10px] font-semibold w-[190px]">Code</th>
                <th className="py-[10px] font-semibold w-[100px]">Credits</th>
                <th className="py-[10px] font-semibold w-[110px]">Used</th>
                <th className="py-[10px] font-semibold">Note</th>
                <th className="py-[10px] font-semibold w-[170px]">Created</th>
                <th className="py-[10px] w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-[#f2f2f2]">
                  <td className="py-[11px] font-mono">{c.code}</td>
                  <td className="py-[11px] tabular-nums">{c.credits}</td>
                  <td className="py-[11px] tabular-nums">{c.usedCount} / {c.maxUses}</td>
                  <td className="py-[11px] text-[#5e5e5e]">{c.note || '—'}</td>
                  <td className="py-[11px] text-[#5e5e5e]">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="py-[11px] text-right">
                    <button type="button" onClick={() => remove(c.id)}
                            className="underline text-[color:var(--bad)] text-[15px]">Delete</button>
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
