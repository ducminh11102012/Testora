'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';

interface Application {
  id: string;
  orgName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  candidates: string;
  website: string;
  reason: string;
  status: string;
  note: string;
  reviewedAt: string | null;
  orgId: string | null;
  createdAt: string;
}

interface Credentials {
  orgName: string; slug: string; username: string; password: string; emailed: boolean; emailError?: string;
}

/**
 * The queue of schools asking for a space. Approving one creates the
 * organisation and its owner account; the password is shown here once, because
 * a deployment with no mail server still has to be able to hand it over.
 */
export default function ApplicationQueue({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(applications.find((a) => a.status === 'pending')?.id ?? null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function act(app: Application, action: 'approve' | 'decline') {
    setBusy(app.id + action); setError(null);
    const res = await fetch(`/api/platform/applications/${app.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, note: notes[app.id] ?? '' }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'That did not work.'); return; }
    if (action === 'approve') {
      setCredentials({
        orgName: app.orgName,
        slug: data.slug,
        username: data.username,
        password: data.password,
        emailed: !!data.emailed,
        emailError: data.emailError,
      });
    }
    router.refresh();
  }

  async function remove(app: Application) {
    setBusy(app.id + 'remove');
    await fetch(`/api/platform/applications/${app.id}`, { method: 'DELETE' });
    setBusy(null);
    router.refresh();
  }

  const pending = applications.filter((a) => a.status === 'pending');
  const decided = applications.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-[26px]">
      {credentials && (
        <section className="border-2 border-black rounded-[6px] p-[22px]" style={{ background: '#F1F7F1' }}>
          <h2 className="text-[20px] font-semibold mb-[8px]">{credentials.orgName} is open</h2>
          <p className="text-[16px] mb-[14px]">
            {credentials.emailed
              ? 'The owner has been emailed these details. Keep them until they have signed in.'
              : 'There is no mail server configured, so pass these on yourself — this is the only time the password is shown.'}
            {credentials.emailError && ` (The email failed: ${credentials.emailError})`}
          </p>
          <dl className="grid gap-[10px] sm:grid-cols-3 text-[16px] mb-[10px]">
            <div><dt className="font-semibold">Username</dt><dd className="font-mono">{credentials.username}</dd></div>
            <div><dt className="font-semibold">Password</dt><dd className="font-mono">{credentials.password || '—'}</dd></div>
            <div><dt className="font-semibold">Their page</dt><dd className="font-mono">/o/{credentials.slug}</dd></div>
          </dl>
          <button type="button" onClick={() => setCredentials(null)} className="underline text-[15px]">
            I have passed these on
          </button>
        </section>
      )}

      {error && (
        <div className="border rounded-[4px] px-[18px] py-[12px] text-[16px]"
             style={{ background: '#FDF2F3', borderColor: '#F0C4C9' }}>{error}</div>
      )}

      <section>
        <h2 className="text-[22px] font-semibold mb-[12px]">
          Waiting {pending.length > 0 && <span className="font-normal text-[color:var(--paper-ink-3)]">· {pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-[17px] text-[color:var(--paper-ink-3)]">
            Nothing waiting. Applications arrive from <code>/apply</code>.
          </p>
        ) : pending.map((app) => (
          <article key={app.id} className="border border-[color:var(--line)] rounded-[6px] p-[20px] mb-[16px]">
            <header className="flex items-start justify-between gap-[16px] flex-wrap">
              <div>
                <h3 className="text-[20px] font-semibold">{app.orgName}</h3>
                <p className="text-[16px] text-[color:var(--paper-ink-3)]">
                  {app.contactName} · <a href={`mailto:${app.contactEmail}`} className="underline">{app.contactEmail}</a>
                  {' · '}<a href={`tel:${app.contactPhone}`} className="underline">{app.contactPhone}</a>
                  {app.candidates && ` · ${app.candidates}`}
                  {app.website && <> · <a href={app.website} target="_blank" rel="noreferrer noopener" className="underline">website</a></>}
                </p>
              </div>
              <span className="text-[15px] text-[color:var(--paper-ink-3)]">{new Date(app.createdAt).toLocaleString()}</span>
            </header>

            <button type="button" onClick={() => setOpen(open === app.id ? null : app.id)}
                    className="mt-[10px] text-[15px] underline">
              {open === app.id ? 'Hide what they wrote' : 'Read what they wrote'}
            </button>

            {open === app.id && (
              <>
                <p className="mt-[12px] text-[17px] leading-[1.6] whitespace-pre-wrap border-l-2 border-[color:var(--line-strong)] pl-[14px]">
                  {app.reason}
                </p>
                <label className="block mt-[16px]">
                  <span className="block text-[14px] font-semibold mb-[6px]">
                    Note to the applicant (required to decline; sent with the approval if you write one)
                  </span>
                  <textarea
                    className="admin-input h-[80px]"
                    value={notes[app.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [app.id]: e.target.value }))}
                  />
                </label>
                <div className="flex gap-[12px] flex-wrap mt-[14px]">
                  <button type="button" disabled={busy !== null} onClick={() => act(app, 'approve')}
                          className="px-[20px] h-[44px] text-white rounded-[4px] text-[16px] disabled:opacity-60"
                          style={{ background: 'var(--brand)' }}>
                    {busy === app.id + 'approve' ? 'Creating…' : 'Approve and create the organisation'}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => act(app, 'decline')}
                          className="px-[18px] h-[44px] border border-[color:var(--line-strong)] rounded-[4px] text-[16px] disabled:opacity-60">
                    {busy === app.id + 'decline' ? 'Sending…' : 'Decline'}
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="text-[22px] font-semibold mb-[12px]">Decided</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[16px] border-collapse">
              <thead>
                <tr className="text-left border-b border-[color:var(--line)]">
                  <th className="py-[8px] font-semibold">Organisation</th>
                  <th className="py-[8px] font-semibold w-[220px]">Contact</th>
                  <th className="py-[8px] font-semibold w-[120px]">Outcome</th>
                  <th className="py-[8px] font-semibold w-[180px]">When</th>
                  <th className="py-[8px] w-[90px]" />
                </tr>
              </thead>
              <tbody>
                {decided.map((app) => (
                  <tr key={app.id} className="border-b border-[color:var(--line)] align-top">
                    <td className="py-[10px]">
                      {app.orgName}
                      {app.note && <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[4px]">{app.note}</p>}
                    </td>
                    <td className="py-[10px] text-[color:var(--paper-ink-3)]">{app.contactEmail}</td>
                    <td className="py-[10px]">
                      <Pill tone={app.status === 'approved' ? 'good' : 'bad'}>{app.status}</Pill>
                    </td>
                    <td className="py-[10px] text-[color:var(--paper-ink-3)]">
                      {app.reviewedAt ? new Date(app.reviewedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-[10px] text-right">
                      <button type="button" disabled={busy !== null} onClick={() => remove(app)} className="underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
