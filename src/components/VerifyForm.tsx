'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Branding } from '@/types/db';
import BrandMark from './ui/BrandMark';
import LogoutButton from './LogoutButton';

/**
 * Shown to an account that has no confirmed address, which happens when the
 * platform ran on usernames alone and a mail server was added afterwards.
 */
export default function VerifyForm({ branding, email, name }: {
  branding: Branding; email: string; name: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(email);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'address' | 'code'>(email ? 'address' : 'address');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNote(null);
    const res = await fetch('/api/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'The code could not be sent.'); return; }
    if (data.verified) { router.push('/dashboard'); router.refresh(); return; }
    setStage('code');
    setNote(`A six-digit code is on its way to ${data.email}. It expires in 20 minutes.`);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/verify', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'That code was not accepted.'); return; }
    router.push(data.role === 'candidate' ? '/dashboard' : '/admin');
    router.refresh();
  }

  return (
    <div className="insp-split">
      <div className="insp-rail" aria-hidden="true" />

      <div className="insp-panel px-[24px] sm:px-[56px] py-[40px] overflow-y-auto">
        <div className="w-full max-w-[720px]">
          <div className="mb-[48px]"><BrandMark branding={branding} tone="brand" /></div>

          <h1 className="text-[40px] leading-[1.2] font-normal mb-[16px]">Confirm your email</h1>
          <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[28px] max-w-[62ch]">
            {name}, this platform now sends codes by email, so your account needs an address on file
            before you can carry on.
          </p>

          {note && <div className="insp-notice mb-[26px]" role="status">{note}</div>}

          {stage === 'address' ? (
            <form onSubmit={sendCode} noValidate className="space-y-[16px] max-w-[560px]">
              <label className="block">
                <span className="block text-[16px] font-semibold mb-[8px]">Email address</span>
                <input
                  required type="email" value={address} onChange={(e) => setAddress(e.target.value)}
                  className="p-input" autoComplete="email" placeholder="you@school.edu.vn"
                />
              </label>
              {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}
              <div className="pt-[6px] flex items-center gap-[18px]">
                <button type="submit" disabled={busy} className="p-btn">
                  {busy ? 'Sending…' : 'Send me a code'}
                </button>
                <LogoutButton />
              </div>
            </form>
          ) : (
            <form onSubmit={confirm} noValidate className="space-y-[16px] max-w-[560px]">
              <label className="block">
                <span className="block text-[16px] font-semibold mb-[8px]">Six-digit code</span>
                <input
                  required inputMode="numeric" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="p-input text-[26px] tracking-[0.4em] text-center"
                  autoComplete="one-time-code" placeholder="000000"
                />
              </label>
              {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}
              <div className="pt-[6px] flex flex-wrap items-center gap-[18px]">
                <button type="submit" disabled={busy || code.length < 6} className="p-btn">
                  {busy ? 'Checking…' : 'Confirm'}
                </button>
                <button type="button" className="p-link text-[16px]" onClick={() => { setStage('address'); setNote(null); }}>
                  Use a different address
                </button>
                <LogoutButton />
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
