'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function JoinForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <p className="text-[18px]">
        <Link href="/login" className="underline">Sign in</Link> or{' '}
        <Link href="/signup" className="underline">create an account</Link> first, then your code is applied to your account.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);

    const res = await fetch('/api/redeem', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(data.error ?? 'That code could not be used.'); return; }

    if (data.kind === 'sitting') {
      const start = await fetch('/api/attempts', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const attempt = await start.json().catch(() => ({}));
      setBusy(false);
      if (!start.ok) { setError(attempt.error ?? 'That sitting could not be started.'); return; }
      // A code for a whole full test opens its hub instead of a single paper.
      router.push(attempt.suiteId
        ? `/suite/${attempt.suiteId}?code=${encodeURIComponent(code.trim().toUpperCase())}`
        : `/test/${attempt.attemptId}`);
      return;
    }

    if (data.kind === 'membership') {
      setBusy(false);
      setDone(data.already
        ? `You are already a member of ${data.orgName}.`
        : `You have joined ${data.orgName}. Their papers are on your dashboard.`);
      setCode('');
      router.refresh();
      return;
    }

    setBusy(false);
    setDone(`Code accepted. ${data.credits} credit${data.credits === 1 ? '' : 's'} added to your account.`);
    setCode('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-[18px]">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC123"
        aria-label="Exam or credit code"
        className="auth-input text-[24px] tracking-[0.24em] font-semibold text-center"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}
      {done && <p role="status" className="text-[17px] text-[color:var(--good)]">{done}</p>}
      <div className="flex gap-[14px] items-center">
        <button type="submit" disabled={busy || !code}
                className="px-[30px] h-[56px] text-[18px] text-white rounded-[4px] disabled:opacity-60"
                style={{ background: 'var(--brand)' }}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <Link href="/dashboard" className="text-[17px] underline">Back to your tests</Link>
      </div>
    </form>
  );
}
