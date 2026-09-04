'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Branding } from '@/types/db';
import BrandMark from './ui/BrandMark';

/**
 * A school asking for a space of its own. Deliberately an application rather
 * than a sign-up: an organisation carries other people's candidates and other
 * people's papers, so a person decides, not a form.
 */
export default function ApplyForm({ branding }: { branding: Branding }) {
  const [form, setForm] = useState({
    orgName: '', contactName: '', contactEmail: '', contactPhone: '',
    candidates: '', website: '', reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'The application could not be sent.'); return; }
    setDone(data.message ?? 'Thank you — your application has been sent.');
  }

  return (
    <div className="insp-split">
      <div className="insp-rail" aria-hidden="true" />

      <div className="insp-panel px-[24px] sm:px-[56px] py-[40px] overflow-y-auto">
        <div className="w-full max-w-[720px]">
          <div className="mb-[48px]">
            <Link href="/" aria-label={branding.wordmark}>
              <BrandMark branding={branding} tone="brand" />
            </Link>
          </div>

          {done ? (
            <>
              <h1 className="text-[40px] leading-[1.2] font-normal mb-[22px]">Application sent</h1>
              <div className="insp-notice mb-[26px]" role="status">{done}</div>
              <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[30px]">
                An administrator reads every application. When yours is approved you will be sent a
                username and password for the owner account, and you can add your teachers from there.
              </p>
              <Link href="/" className="p-btn inline-block">Back to the home page</Link>
            </>
          ) : (
            <>
              <h1 className="text-[40px] leading-[1.2] font-normal mb-[18px]">
                Apply for an organisation
              </h1>
              <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[30px] max-w-[62ch]">
                A space of your own: your candidates, your papers, your sittings, your branding —
                separate from every other centre on the platform. Tell us who you are and what you
                need it for, and an administrator will set it up.
              </p>

              <form onSubmit={submit} className="space-y-[22px] max-w-[600px]">
                <Field label="Organisation name" hint="As it should appear to your candidates.">
                  <input required value={form.orgName} onChange={set('orgName')} className="p-input"
                         placeholder="Trường THPT Chuyên …" />
                </Field>

                <Field label="Your name">
                  <input required value={form.contactName} onChange={set('contactName')} className="p-input"
                         autoComplete="name" />
                </Field>

                <Field label="Email" hint="Where the decision and the owner account will be sent.">
                  <input required type="email" value={form.contactEmail} onChange={set('contactEmail')}
                         className="p-input" autoComplete="email" />
                </Field>

                <Field label="Phone number">
                  <input required value={form.contactPhone} onChange={set('contactPhone')} className="p-input"
                         autoComplete="tel" inputMode="tel" />
                </Field>

                <div className="grid gap-[22px] sm:grid-cols-2">
                  <Field label="How many candidates" hint="Roughly, per intake.">
                    <input value={form.candidates} onChange={set('candidates')} className="p-input"
                           placeholder="e.g. 120 a term" />
                  </Field>
                  <Field label="Website (optional)">
                    <input value={form.website} onChange={set('website')} className="p-input"
                           placeholder="https://…" />
                  </Field>
                </div>

                <Field
                  label="What you need it for"
                  hint="A few sentences: which exams, which classes, when you want to start, and anything an administrator should know to say yes."
                >
                  <textarea
                    required
                    value={form.reason}
                    onChange={set('reason')}
                    className="p-input min-h-[170px]"
                    placeholder="We are a specialised-English centre in Nghệ An preparing about 120 students a term for the provincial gifted-student examination and IELTS…"
                  />
                  <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[7px]">
                    {form.reason.trim().length} characters — at least 60, please.
                  </p>
                </Field>

                {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}

                <div className="pt-[6px]">
                  <button type="submit" disabled={busy} className="p-btn">
                    {busy ? 'Sending…' : 'Send application'}
                  </button>
                </div>
              </form>

              <hr className="p-rule mt-[40px] mb-[22px] max-w-[560px]" />
              <p className="text-[17px] text-[color:var(--paper-ink-2)] max-w-[560px]">
                Only sitting a paper yourself? You do not need any of this —{' '}
                <Link href="/signup" className="underline">create a candidate account</Link> and the
                shared bank is open to you straight away.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[17px] font-semibold mb-[8px]">{label}</span>
      {hint && <span className="block text-[16px] text-[color:var(--paper-ink-3)] mb-[8px]">{hint}</span>}
      {children}
    </label>
  );
}
