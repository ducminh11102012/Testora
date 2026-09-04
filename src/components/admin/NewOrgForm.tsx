'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewOrgForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', slug: '', plan: 'starter' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="border border-[color:var(--line)] rounded-[6px] p-[22px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const res = await fetch('/api/platform/orgs', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
        });
        setBusy(false);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data.error ?? 'Could not create the organisation.'); return; }
        setForm({ name: '', slug: '', plan: 'starter' });
        router.refresh();
      }}
    >
      <h3 className="text-[20px] font-semibold mb-[14px]">Add an organisation</h3>
      <div className="grid gap-[12px] sm:grid-cols-3">
        <input required className="admin-input" placeholder="School or centre name" value={form.name}
               onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="admin-input" placeholder="web address (optional)" value={form.slug}
               onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <select className="admin-input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
          <option value="starter">Starter</option>
          <option value="school">School</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      {error && <p className="mt-[10px] text-[16px] text-[color:var(--bad)]">{error}</p>}
      <button type="submit" disabled={busy}
              className="mt-[16px] px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
        {busy ? 'Creating…' : 'Create'}
      </button>
    </form>
  );
}
