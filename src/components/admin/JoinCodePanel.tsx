'use client';

import { useState } from 'react';

/**
 * The code candidates type at sign-up to land inside this organisation.
 * Rotating it stops the old one working, which is what you want after a code
 * has been passed around outside the school.
 */
export default function JoinCodePanel({ code, orgName, community }: {
  code: string; orgName: string; community?: boolean;
}) {
  const [value, setValue] = useState(code);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function rotate() {
    setBusy(true);
    const res = await fetch('/api/admin/join-code', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setConfirming(false);
    if (data.joinCode) { setValue(data.joinCode); setCopied(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); } catch { /* clipboard blocked */ }
  }

  return (
    <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[26px]">
      <h2 className="text-[20px] font-semibold mb-[6px]">Join code</h2>
      <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[16px] max-w-[70ch]">
        {community
          ? `Anyone who types this code at sign-up joins ${orgName} and can sit everything published there. It is the open space, so treat it as public.`
          : `Give this to candidates. Typing it at sign-up, or on the join page, enrols them in ${orgName} and releases your published papers to them.`}
      </p>
      <div className="flex flex-wrap items-center gap-[12px]">
        <code className="text-[30px] font-semibold tracking-[0.22em] px-[18px] py-[10px] border border-[color:var(--line)] rounded-[4px] bg-[color:var(--paper-sunk)]">
          {value}
        </code>
        <button onClick={copy} className="px-[18px] h-[46px] rounded-[4px] border border-[color:var(--line-strong)] text-[16px]">
          {copied ? 'Copied' : 'Copy'}
        </button>
        {confirming ? (
          <>
            <button onClick={rotate} disabled={busy}
                    className="px-[18px] h-[46px] rounded-[4px] text-[16px] text-white disabled:opacity-60"
                    style={{ background: 'var(--bad)' }}>
              {busy ? 'Working…' : 'Yes, replace it'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-[16px] underline">Keep the old code</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-[16px] underline">Issue a new code</button>
        )}
      </div>
      {confirming && (
        <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[12px]">
          Candidates who already joined stay where they are. Only the old code stops working.
        </p>
      )}
    </section>
  );
}
