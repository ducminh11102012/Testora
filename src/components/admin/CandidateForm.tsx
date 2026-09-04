'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateForm() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '', displayName: '', testTakerId: '', role: 'candidate' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="border border-[color:var(--line)] rounded-[3px] p-[22px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const res = await fetch('/api/admin/users', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
        });
        setBusy(false);
        if (!res.ok) { setError((await res.json()).error ?? 'Could not create the account.'); return; }
        setForm({ username: '', password: '', displayName: '', testTakerId: '', role: 'candidate' });
        router.refresh();
      }}
    >
      <h2 className="text-[20px] font-semibold mb-[14px]">Add an account</h2>
      <div className="grid gap-[12px] sm:grid-cols-5">
        <input required value={form.username} onChange={set('username')} placeholder="Username" className="admin-input" />
        <input required value={form.password} onChange={set('password')} placeholder="Password" type="text" className="admin-input" />
        <input value={form.displayName} onChange={set('displayName')} placeholder="Full name" className="admin-input" />
        <input value={form.testTakerId} onChange={set('testTakerId')} placeholder="Test taker ID" className="admin-input" />
        <select value={form.role} onChange={set('role')} className="admin-input">
          <option value="candidate">Candidate</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {error && <p className="text-[15px] text-[#c4142e] mt-[10px]">{error}</p>}
      <button type="submit" disabled={busy}
              className="mt-[16px] px-[20px] h-[44px] text-white rounded-[3px] text-[16px] disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
