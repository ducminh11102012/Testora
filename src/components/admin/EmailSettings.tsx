'use client';

import { useState } from 'react';

type Public = {
  enabled: boolean; host: string; port: number; secure: boolean; user: string;
  fromEmail: string; fromName: string; requireVerification: boolean;
  passwordMasked: string; usable: boolean;
};

/**
 * SMTP for the one message the platform sends: the verification code. Leave it
 * off and accounts are username and password only, which is what a school
 * running the platform on a closed network usually wants.
 */
export default function EmailSettings({ initial }: { initial: Public }) {
  const [form, setForm] = useState<Public>(initial);
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Public>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true); setMessage(null); setError(null);
    const res = await fetch('/api/platform/email', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, ...(password ? { password } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Could not save.'); return; }
    setForm(data.config); setPassword(''); setMessage('Saved.');
  }

  async function test() {
    setBusy(true); setMessage(null); setError(null);
    const res = await fetch('/api/platform/email', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: testTo || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'The test failed.'); return; }
    setMessage(data.message);
  }

  return (
    <div className="max-w-[840px]">
      <h1 className="text-[32px] font-normal mb-[8px]">Email</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-2)] mb-[26px] max-w-[70ch]">
        Used for verification codes. While this is off, signing up asks for a username and a
        password and nothing else. Turn it on and every account is asked to confirm an address,
        including the ones created before today.
      </p>

      <section className="p-card p-[22px] mb-[18px]">
        <label className="flex items-start gap-[12px] mb-[18px]">
          <input type="checkbox" className="mt-[4px]" checked={form.enabled}
                 onChange={(e) => set({ enabled: e.target.checked })} />
          <span>
            <b className="text-[17px]">Send email through this server</b>
            <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
              Off means no codes are sent and nobody is asked for an address.
            </span>
          </span>
        </label>

        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Host">
            <input className="admin-input" value={form.host} onChange={(e) => set({ host: e.target.value })}
                   placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port">
            <input className="admin-input" type="number" value={form.port}
                   onChange={(e) => set({ port: Number(e.target.value) })} />
          </Field>
          <Field label="Username">
            <input className="admin-input" value={form.user} onChange={(e) => set({ user: e.target.value })}
                   autoComplete="off" />
          </Field>
          <Field label={`Password${form.passwordMasked ? ` (stored: ${form.passwordMasked})` : ''}`}>
            <input className="admin-input" type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep"
                   autoComplete="new-password" />
          </Field>
          <Field label="From address">
            <input className="admin-input" value={form.fromEmail}
                   onChange={(e) => set({ fromEmail: e.target.value })} placeholder="no-reply@school.edu.vn" />
          </Field>
          <Field label="From name">
            <input className="admin-input" value={form.fromName}
                   onChange={(e) => set({ fromName: e.target.value })} placeholder="Testora" />
          </Field>
        </div>

        <label className="flex items-start gap-[12px] mt-[18px]">
          <input type="checkbox" className="mt-[4px]" checked={form.secure}
                 onChange={(e) => set({ secure: e.target.checked })} />
          <span>
            <b className="text-[17px]">Implicit TLS</b>
            <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
              On for port 465. Port 587 upgrades the connection itself, so leave this off.
            </span>
          </span>
        </label>
      </section>

      <section className="p-card p-[22px] mb-[18px]">
        <label className="flex items-start gap-[12px]">
          <input type="checkbox" className="mt-[4px]" checked={form.requireVerification}
                 onChange={(e) => set({ requireVerification: e.target.checked })} />
          <span>
            <b className="text-[17px]">Require a confirmed address</b>
            <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
              New accounts confirm a code before they can sit anything. Accounts made while email
              was off are asked for an address the next time they sign in.
            </span>
          </span>
        </label>
      </section>

      <section className="p-card p-[22px] mb-[22px]">
        <h2 className="text-[19px] font-semibold mb-[10px]">Check it works</h2>
        <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[14px]">
          Save first. With an address filled in a real message is sent; leave it blank to test the
          connection alone.
        </p>
        <div className="flex flex-wrap gap-[10px] items-center">
          <input className="admin-input max-w-[320px]" value={testTo} onChange={(e) => setTestTo(e.target.value)}
                 placeholder="you@example.com" />
          <button onClick={test} disabled={busy} className="p-btn-ghost p-btn-sm">Send a test</button>
        </div>
      </section>

      <div className="flex items-center gap-[16px]">
        <button onClick={save} disabled={busy} className="p-btn">{busy ? 'Working…' : 'Save settings'}</button>
        {message && <span className="text-[16px] text-[color:var(--good)]">{message}</span>}
        {error && <span role="alert" className="text-[16px] text-[color:var(--bad)]">{error}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[14px] font-semibold mb-[6px]">{label}</span>
      {children}
    </label>
  );
}
