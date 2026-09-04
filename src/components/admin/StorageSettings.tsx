'use client';

import { useState } from 'react';
import { BucketView, RETENTION_CHOICES } from '@/lib/storage/types';

type Shared = { id: string; label: string; bucket: string; enabled: boolean };

const BLANK = {
  kind: 'hf' as 'hf' | 's3',
  visibility: 'private' as 'public' | 'private',
  label: '', hfRepoId: '', hfRevision: 'main', hfToken: '',
  provider: 'r2' as 'r2' | 's3', accountId: '', bucket: '', region: 'auto',
  endpoint: '', accessKeyId: '', secretAccessKey: '', publicBaseUrl: '', enabled: true,
};

/**
 * Cloudflare R2 (or any S3-compatible bucket) for the original uploads. The
 * same screen serves the platform and an organisation; `scope` decides which
 * endpoint it talks to and what it is allowed to change.
 */
export default function StorageSettings({
  scope, initial, shared = [], retentionHours, platformRetention, mirrorToAll = true,
  rootSource, hfConnect = false, connected, trouble = null,
}: {
  scope: 'platform' | 'org';
  initial: BucketView[];
  shared?: Shared[];
  retentionHours: number;
  platformRetention?: number;
  mirrorToAll?: boolean;
  /** Where the primary bucket's credentials came from. */
  rootSource?: 'env' | 'file' | 'none';
  /** An OAuth application is configured, so the Hub can be connected by redirect. */
  hfConnect?: boolean;
  /** The repository just connected, when we have come back from the Hub. */
  connected?: string;
  /**
   * The primary store could not be read. The page still opens — this is where
   * its credentials are fixed, so it must — and says so instead of listing an
   * empty page as if nothing were configured.
   */
  trouble?: string | null;
}) {
  const endpoint = scope === 'platform' ? '/api/platform/storage' : '/api/admin/storage';
  const [buckets, setBuckets] = useState<BucketView[]>(initial);
  const [form, setForm] = useState({ ...BLANK });
  const [retention, setRetention] = useState(retentionHours);
  const [mirror, setMirror] = useState(mirrorToAll);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof BLANK>) => setForm((f) => ({ ...f, ...patch }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Could not add that bucket.'); return; }
    setBuckets((b) => [...b, data.bucket]);
    setForm({ ...BLANK });
    setMessage(data.tested
      ? 'Added, and a test object was written and deleted.'
      : `Added, but the test failed: ${data.error}`);
  }

  async function act(id: string, action: 'test' | 'remove' | 'toggle', enabled?: boolean) {
    setBusy(true); setError(null); setMessage(null);
    const body = action === 'toggle' ? { id, enabled } : { id, action };
    const res = await fetch(endpoint, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (action === 'remove') { setBuckets((b) => b.filter((x) => x.id !== id)); setMessage('Removed.'); return; }
    if (data.bucket) setBuckets((b) => b.map((x) => (x.id === id ? data.bucket : x)));
    if (action === 'test') setMessage(data.ok ? 'The bucket answered and accepted a write.' : `Failed: ${data.error}`);
  }

  async function saveRetention() {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scope === 'platform'
        ? { retentionHours: retention, mirrorToAll: mirror }
        : { retentionHours: retention }),
    });
    setBusy(false);
    if (!res.ok) { setError('Could not save.'); return; }
    setMessage('Saved.');
  }

  return (
    <div className="max-w-[900px]">
      <h1 className="text-[32px] font-normal mb-[8px]">Storage</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-2)] mb-[20px] max-w-[72ch]">
        Uploaded Word and PDF papers go to Hugging Face while they are being read, then are deleted
        on the schedule below. A Cloudflare R2 bucket can be added as a backup copy. Questions and
        answers live in the database; the original file does not have to.
      </p>

      <div className="p-card p-[18px] mb-[18px] text-[16px] leading-[1.6]">
        <b>Where a paper goes</b>
        <ul className="mt-[8px] mb-0 pl-[20px] list-disc text-[color:var(--paper-ink-2)]">
          <li>Community and platform papers → the <b>public</b> Hugging Face dataset, readable by anyone.</li>
          <li>A school&rsquo;s papers → its <b>private</b> dataset, readable only with the token.</li>
          <li>Any R2 or S3 target enabled here also receives a copy, as the backup.</li>
        </ul>
      </div>

      {scope === 'platform' && (
        <div className="insp-notice mb-[22px]">
          Every setting on this page, and every key on it, is kept in an encrypted object inside
          the primary store — not in the database. Its own credentials come from{' '}
          {rootSource === 'env' ? 'this deployment&rsquo;s environment variables'
            : rootSource === 'file' ? 'the local configuration file written during setup'
              : 'nowhere yet'}
          , and it cannot be removed from here.
        </div>
      )}

      {trouble && (
        <div className="insp-notice insp-notice--warn mb-[22px]" role="alert">
          <b>The list below may be incomplete.</b> {trouble} Anything added or removed here cannot be
          saved until the store answers again; the primary target is still shown so its keys can be
          corrected.
        </div>
      )}

      {connected && (
        <div className="insp-notice mb-[22px]" role="status">
          Connected to <b>{connected}</b> on the Hub, and it is ready to take papers.
        </div>
      )}

      {hfConnect && (
        <section className="p-card p-[22px] mb-[18px]">
          <h2 className="text-[19px] font-semibold mb-[6px]">Connect a Hugging Face account</h2>
          <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[14px] max-w-[70ch]">
            You sign in on huggingface.co and come back; the dataset is created for you and nothing
            is typed here. The Hub&rsquo;s sign-in tokens expire after a few hours, so a pasted write
            token below is the steadier choice for a server left running — this is the quick way to
            get going.
          </p>
          <div className="flex flex-wrap gap-[10px]">
            <a className="p-btn-ghost p-btn-sm"
               href={`/api/auth/hf/start?intent=storage&owner=${scope === 'platform' ? 'platform' : 'org'}&visibility=private`}>
              Connect a private dataset
            </a>
            {scope === 'platform' && (
              <a className="p-btn-ghost p-btn-sm"
                 href="/api/auth/hf/start?intent=storage&owner=platform&visibility=public">
                Connect a public dataset for the community bank
              </a>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- retention */}
      <section className="p-card p-[22px] mb-[18px]">
        <h2 className="text-[19px] font-semibold mb-[12px]">How long uploads are kept</h2>
        <div className="flex flex-wrap items-center gap-[12px]">
          <select className="admin-input max-w-[360px]" value={retention}
                  onChange={(e) => setRetention(Number(e.target.value))}>
            {RETENTION_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button onClick={saveRetention} disabled={busy} className="p-btn-ghost p-btn-sm">Save</button>
        </div>
        {scope === 'org' && platformRetention !== undefined && (
          <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[10px]">
            The platform keeps uploads for{' '}
            {platformRetention < 0 ? 'as long as you like' : `${platformRetention} hour(s)`}. Your
            rule can be stricter than that, never looser.
          </p>
        )}
        {scope === 'platform' && (
          <label className="flex items-start gap-[12px] mt-[16px]">
            <input type="checkbox" className="mt-[4px]" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
            <span>
              <b className="text-[17px]">Write every upload to all enabled buckets</b>
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                Off keeps one copy, in the first bucket that is enabled.
              </span>
            </span>
          </label>
        )}
      </section>

      {/* ------------------------------------------------------------ buckets */}
      <section className="mb-[18px]">
        <h2 className="text-[19px] font-semibold mb-[12px]">
          {scope === 'platform' ? 'Platform storage' : 'Your storage'}
        </h2>
        {buckets.length === 0 ? (
          <div className="insp-notice">
            Nothing added yet. Uploads are read in memory and never stored anywhere.
          </div>
        ) : (
          <ul className="list-none p-0 m-0 border-t border-[color:var(--line)]">
            {buckets.map((b) => (
              <li key={b.id} className="border-b border-[color:var(--line)] py-[16px]">
                <div className="flex flex-wrap items-center gap-[14px]">
                  <div className="flex-1 min-w-[280px]">
                    <div className="text-[18px] font-semibold mb-[4px]">
                      {b.label}{' '}
                      <span className="text-[15px] font-normal text-[color:var(--paper-ink-3)]">
                        · {b.kind === 'hf' ? 'Hugging Face' : b.provider.toUpperCase()}
                        {' · '}{b.kind === 'hf' ? b.hfRepoId : b.bucket}
                        {b.kind === 'hf' ? ` · ${b.visibility}` : ''}
                        {b.root ? ' · primary' : ''}
                      </span>
                    </div>
                    <div className="text-[15px] text-[color:var(--paper-ink-3)] break-all">
                      {b.kind === 'hf'
                        ? <>token {b.secretMasked}{b.hubUrl && <> · <a className="p-link" href={b.hubUrl} target="_blank" rel="noreferrer">open on the Hub</a></>}</>
                        : <>{b.endpoint} · key {b.accessKeyId.slice(0, 6)}… · secret {b.secretMasked}</>}
                    </div>
                    {b.lastError && <div className="text-[15px] text-[color:var(--bad)] mt-[4px]">{b.lastError}</div>}
                  </div>
                  <label className="flex items-center gap-[8px] text-[15px]">
                    <input type="checkbox" checked={b.enabled} disabled={b.root}
                           onChange={(e) => act(b.id, 'toggle', e.target.checked)} />
                    Enabled
                  </label>
                  <button onClick={() => act(b.id, 'test')} disabled={busy} className="p-btn-ghost p-btn-sm">Test</button>
                  {!b.root && (
                    <button onClick={() => act(b.id, 'remove')} disabled={busy}
                            className="text-[15px] underline text-[color:var(--bad)]">Remove</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {scope === 'org' && shared.length > 0 && (
          <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[14px]">
            Shared platform storage is also available to you:{' '}
            {shared.filter((s) => s.enabled).map((s) => s.label).join(', ') || 'none enabled'}.
            Adding your own bucket stores a copy there as well.
          </p>
        )}
      </section>

      {/* -------------------------------------------------------------- add */}
      <section className="p-card p-[22px]">
        <h2 className="text-[19px] font-semibold mb-[6px]">Add a place to store papers</h2>
        <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[16px]">
          Hugging Face: <b>Settings → Access Tokens</b> → a token with write permission; the dataset
          is created if it does not exist. Cloudflare: <b>R2 → your bucket → Manage API tokens</b>,
          Object Read &amp; Write.
        </p>
        <form onSubmit={add} className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Where">
            <select className="admin-input" value={form.kind}
                    onChange={(e) => set({ kind: e.target.value as 'hf' | 's3' })}>
              <option value="hf">Hugging Face dataset</option>
              <option value="s3">Cloudflare R2 or S3 (backup)</option>
            </select>
          </Field>
          <Field label="Name">
            <input required className="admin-input" value={form.label}
                   onChange={(e) => set({ label: e.target.value })}
                   placeholder={form.kind === 'hf' ? 'Hub — community' : 'R2 — Singapore'} />
          </Field>

          {form.kind === 'hf' ? (
            <>
              <Field label="Dataset (namespace/name)">
                <input required className="admin-input" value={form.hfRepoId}
                       onChange={(e) => set({ hfRepoId: e.target.value })}
                       placeholder="my-school/testora-papers" spellCheck={false} />
              </Field>
              <Field label="Write token">
                <input required type="password" className="admin-input" value={form.hfToken}
                       onChange={(e) => set({ hfToken: e.target.value })}
                       placeholder="hf_…" autoComplete="new-password" />
              </Field>
              <Field label="Who can read it">
                <select className="admin-input" value={form.visibility}
                        onChange={(e) => set({ visibility: e.target.value as 'public' | 'private' })}>
                  <option value="private">Private — a school&rsquo;s own papers</option>
                  <option value="public">Public — the community bank</option>
                </select>
              </Field>
              <Field label="Branch">
                <input className="admin-input" value={form.hfRevision}
                       onChange={(e) => set({ hfRevision: e.target.value })} placeholder="main" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Kind">
                <select className="admin-input" value={form.provider}
                        onChange={(e) => set({ provider: e.target.value as 'r2' | 's3' })}>
                  <option value="r2">Cloudflare R2</option>
                  <option value="s3">Other S3-compatible</option>
                </select>
              </Field>
              {form.provider === 'r2' ? (
                <Field label="Account id">
                  <input className="admin-input" value={form.accountId}
                         onChange={(e) => set({ accountId: e.target.value })} placeholder="a1b2c3…" />
                </Field>
              ) : (
                <Field label="Endpoint">
                  <input className="admin-input" value={form.endpoint}
                         onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://s3.example.com" />
                </Field>
              )}
              <Field label="Bucket">
                <input required className="admin-input" value={form.bucket}
                       onChange={(e) => set({ bucket: e.target.value })} placeholder="testora-uploads" />
              </Field>
              <Field label="Access key id">
                <input required className="admin-input" value={form.accessKeyId}
                       onChange={(e) => set({ accessKeyId: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Secret access key">
                <input required type="password" className="admin-input" value={form.secretAccessKey}
                       onChange={(e) => set({ secretAccessKey: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Public base URL (optional)">
                <input className="admin-input" value={form.publicBaseUrl}
                       onChange={(e) => set({ publicBaseUrl: e.target.value })}
                       placeholder="https://files.school.edu.vn" />
              </Field>
              <Field label="Region">
                <input className="admin-input" value={form.region}
                       onChange={(e) => set({ region: e.target.value })} placeholder="auto" />
              </Field>
            </>
          )}
          <div className="sm:col-span-2 flex items-center gap-[16px] pt-[4px]">
            <button type="submit" disabled={busy} className="p-btn">
              {busy ? 'Working…' : 'Add and test'}
            </button>
            {message && <span className="text-[16px] text-[color:var(--good)]">{message}</span>}
            {error && <span role="alert" className="text-[16px] text-[color:var(--bad)]">{error}</span>}
          </div>
        </form>
      </section>
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
