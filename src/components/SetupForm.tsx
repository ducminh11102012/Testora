'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Branding } from '@/types/db';
import BrandMark from './ui/BrandMark';

/**
 * The first two screens a new deployment shows, in the order they have to
 * happen: the bucket everything is kept in, then the account that administers
 * it. Nothing else in the product works until both exist.
 */
export default function SetupForm({ branding, step, hfConnect = false, connected }: {
  branding: Branding; step: 'storage' | 'admin';
  /** An OAuth application is configured, so the Hub can be connected by redirect. */
  hfConnect?: boolean;
  /** Set when we have just come back from the Hub having made the repository. */
  connected?: string;
}) {
  const [stage, setStage] = useState<'storage' | 'admin'>(step);
  return (
    <div className="insp-split">
      <div className="insp-rail" aria-hidden="true" />
      <div className="insp-panel px-[24px] sm:px-[56px] py-[40px] overflow-y-auto">
        <div className="w-full max-w-[720px]">
          <div className="mb-[40px]"><BrandMark branding={branding} tone="brand" /></div>
          <ol className="flex gap-[26px] mb-[34px] list-none p-0 m-0 text-[15px]">
            <Step n={1} label="Storage" active={stage === 'storage'} done={stage === 'admin'} />
            <Step n={2} label="Administrator" active={stage === 'admin'} done={false} />
          </ol>
          {stage === 'storage'
            ? <StorageStep onDone={() => setStage('admin')} hfConnect={hfConnect} connected={connected} />
            : <AdminStep branding={branding} />}
        </div>
      </div>
    </div>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-[9px]">
      <span
        className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[14px] font-semibold"
        style={{
          background: active || done ? 'var(--brand)' : 'var(--paper-sunk)',
          color: active || done ? '#fff' : 'var(--paper-ink-3)',
        }}
      >
        {done ? '✓' : n}
      </span>
      <span className={active ? 'font-semibold' : 'text-[color:var(--paper-ink-3)]'}>{label}</span>
    </li>
  );
}

/* ------------------------------------------------------------- storage */

function StorageStep({ onDone, hfConnect, connected }: {
  onDone: () => void; hfConnect?: boolean; connected?: string;
}) {
  const [form, setForm] = useState({
    kind: 'hf' as 'hf' | 's3',
    label: 'Hugging Face (private)',
    hfToken: '', hfRepoId: '', hfRevision: 'main',
    provider: 'r2' as 'r2' | 's3', accountId: '', bucket: '',
    region: 'auto', endpoint: '', accessKeyId: '', secretAccessKey: '', publicBaseUrl: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<Record<string, string> | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setEnv(null);
    const res = await fetch('/api/setup/storage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Could not reach that bucket.'); return; }
    if (data.readOnly) { setEnv(data.env); return; }
    onDone();
  }

  const hub = form.kind === 'hf';
  return (
    <>
      <h1 className="text-[38px] leading-[1.2] font-normal mb-[14px]">Connect your storage</h1>
      <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[24px] max-w-[62ch]">
        Testora keeps uploaded papers and its own settings on Hugging Face — a private dataset
        repository — with Cloudflare R2 available afterwards as a backup copy. These credentials are
        saved to a file on this server, not to the database; everything else is then stored in the
        repository, encrypted.
      </p>

      {connected && (
        <div className="insp-notice mb-[22px]" role="status">
          Connected to <b>{connected}</b> on the Hub. Carry on to the administrator account.
          <div className="mt-[12px]"><button className="p-btn" onClick={onDone}>Next step</button></div>
        </div>
      )}

      {hub && hfConnect && !connected && (
        <div className="p-card p-[20px] mb-[22px]">
          <b className="text-[17px]">Connect with your Hugging Face account</b>
          <p className="text-[16px] text-[color:var(--paper-ink-2)] mt-[6px] mb-[14px] max-w-[62ch]">
            You sign in on huggingface.co and come back; the private dataset is created for you and
            no token is typed here. The Hub&rsquo;s tokens expire after a few hours, so for a server
            nobody watches, a pasted write token below is the steadier choice.
          </p>
          <a className="p-btn" href="/api/auth/hf/start?intent=storage&owner=root&visibility=private">
            Continue with Hugging Face
          </a>
        </div>
      )}

      <div className="insp-notice mb-[26px]">
        {hub ? (
          <>On Hugging Face: <b>Settings → Access Tokens</b>, create a token with <b>write</b>
            {' '}permission. Name the dataset <code>your-name/testora-private</code>; it is created
            for you and kept private. Public papers get their own repository later.</>
        ) : (
          <>In Cloudflare: <b>R2 → your bucket → Manage API tokens</b>, create a token with Object
            Read &amp; Write. Keep the bucket private.</>
        )}
      </div>

      {env ? (
        <>
          <div className="insp-notice mb-[22px]">
            This server cannot write to its own disk, which is normal on a serverless host. Add
            these environment variables to the project, redeploy, and this step is done.
          </div>
          <pre className="p-card p-[18px] text-[14px] overflow-x-auto mb-[22px]">
            {Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}
          </pre>
          <button className="p-btn-ghost" onClick={() => setEnv(null)}>Back to the form</button>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-[14px] sm:grid-cols-2 max-w-[620px]">
          <Field label="Where">
            <select className="p-input" value={form.kind} onChange={set('kind')}>
              <option value="hf">Hugging Face dataset (recommended)</option>
              <option value="s3">Cloudflare R2 or S3</option>
            </select>
          </Field>
          <Field label="Name">
            <input className="p-input" value={form.label} onChange={set('label')} />
          </Field>

          {hub ? (
            <>
              <Field label="Dataset (namespace/name)">
                <input required className="p-input" value={form.hfRepoId} onChange={set('hfRepoId')}
                       placeholder="my-school/testora-private" spellCheck={false} />
              </Field>
              <Field label="Write token">
                <input required type="password" className="p-input" value={form.hfToken}
                       onChange={set('hfToken')} placeholder="hf_…" autoComplete="new-password" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Kind">
                <select className="p-input" value={form.provider} onChange={set('provider')}>
                  <option value="r2">Cloudflare R2</option>
                  <option value="s3">Other S3-compatible</option>
                </select>
              </Field>
              {form.provider === 'r2' ? (
                <Field label="Account id">
                  <input required className="p-input" value={form.accountId} onChange={set('accountId')}
                         placeholder="a1b2c3…" spellCheck={false} />
                </Field>
              ) : (
                <Field label="Endpoint">
                  <input required className="p-input" value={form.endpoint} onChange={set('endpoint')}
                         placeholder="https://s3.example.com" spellCheck={false} />
                </Field>
              )}
              <Field label="Bucket">
                <input required className="p-input" value={form.bucket} onChange={set('bucket')}
                       placeholder="testora" spellCheck={false} />
              </Field>
              <Field label="Access key id">
                <input required className="p-input" value={form.accessKeyId} onChange={set('accessKeyId')}
                       autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Secret access key">
                <input required type="password" className="p-input" value={form.secretAccessKey}
                       onChange={set('secretAccessKey')} autoComplete="new-password" />
              </Field>
            </>
          )}

          {error && <p role="alert" className="sm:col-span-2 text-[17px] text-[color:var(--bad)]">{error}</p>}

          <div className="sm:col-span-2 pt-[6px]">
            <button type="submit" disabled={busy} className="p-btn">
              {busy ? 'Checking…' : 'Connect storage'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/* --------------------------------------------------------------- admin */

function AdminStep({ branding }: { branding: Branding }) {
  const router = useRouter();
  const [form, setForm] = useState({
    platformName: branding.wordmark, displayName: '', username: '', email: '', password: '', confirm: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    const res = await fetch('/api/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Could not create the account.'); return; }
    router.push('/platform');
    router.refresh();
  }

  return (
    <>
      <h1 className="text-[38px] leading-[1.2] font-normal mb-[14px]">Create the administrator account</h1>
      <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[26px] max-w-[62ch]">
        This is the only account that can reach platform settings, so make the password a long one.
        Nobody else can sign up until it exists.
      </p>

      <div className="insp-notice mb-[28px]">
        An email address is optional. Without a mail server the platform runs on usernames and
        passwords alone; add SMTP later in <b>Platform → Email</b> and accounts are asked to confirm
        an address from then on.
      </div>

      <form onSubmit={submit} noValidate className="space-y-[16px] max-w-[560px]">
        <Field label="Platform name">
          <input className="p-input" value={form.platformName} onChange={set('platformName')} />
        </Field>
        <Field label="Your name">
          <input required className="p-input" value={form.displayName} onChange={set('displayName')} autoComplete="name" />
        </Field>
        <Field label="Username">
          <input required className="p-input" value={form.username} onChange={set('username')}
                 autoComplete="username" spellCheck={false} placeholder="admin" />
        </Field>
        <Field label="Email (optional)">
          <input type="email" className="p-input" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input required type="password" className="p-input" value={form.password}
                 onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="Password again">
          <input required type="password" className="p-input" value={form.confirm}
                 onChange={set('confirm')} autoComplete="new-password" />
        </Field>

        {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}

        <div className="pt-[6px]">
          <button type="submit" disabled={busy} className="p-btn">
            {busy ? 'Creating…' : 'Create administrator'}
          </button>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[16px] font-semibold mb-[8px]">{label}</span>
      {children}
    </label>
  );
}
