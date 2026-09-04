'use client';

import { useState } from 'react';

type Public = {
  oauth: boolean; token: boolean; allowSignup: boolean;
  clientIdSet: boolean; secretSet: boolean; extraScopes: string;
};

/**
 * Sign in with Hugging Face: the redirect flow for everyone, and a token box
 * for places a redirect cannot come back to.
 */
export default function SignInSettings({ initial, clientId, callbackUrl }: {
  initial: Public; clientId: string; callbackUrl: string;
}) {
  const [form, setForm] = useState({
    enabled: initial.oauth || initial.token,
    tokenSignIn: initial.token,
    allowSignup: initial.allowSignup,
    clientId,
    clientSecret: '',
    extraScopes: initial.extraScopes,
  });
  const [secretSet, setSecretSet] = useState(initial.secretSet);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true); setMessage(null); setError(null);
    const res = await fetch('/api/platform/sign-in', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Could not save.'); return; }
    setSecretSet(data.config.secretSet);
    setForm((f) => ({ ...f, clientSecret: '' }));
    setMessage('Saved.');
  }

  return (
    <div className="max-w-[840px]">
      <h1 className="text-[32px] font-normal mb-[8px]">Sign-in</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-2)] mb-[24px] max-w-[72ch]">
        Username and password always work. This adds a Hugging Face button to the <b>staff</b>
        {' '}sign-in at <code>/login?staff=1</code> — it links to an account that already holds a
        staff role, and it will not create one or let a candidate in. Candidates sign in with the
        username their centre issued, which is also what keeps the exam room free of third-party
        redirects.
      </p>

      <div className="insp-notice mb-[22px]">
        Create the app at <b>huggingface.co → Settings → Connected Applications → New application</b>.
        Set the redirect URI to exactly:
        <br />
        <code className="text-[15px]">{callbackUrl}</code>
        <br />
        Scopes <code>openid profile email</code> are requested for you. Leave the secret blank for a
        public app; the flow uses PKCE either way.
      </div>

      <section className="p-card p-[22px] mb-[18px]">
        <label className="flex items-start gap-[12px] mb-[18px]">
          <input type="checkbox" className="mt-[4px]" checked={form.enabled}
                 onChange={(e) => set({ enabled: e.target.checked })} />
          <span>
            <b className="text-[17px]">Offer Hugging Face sign-in</b>
            <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
              Off hides the button and refuses the callback.
            </span>
          </span>
        </label>

        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Client ID">
            <input className="admin-input" value={form.clientId}
                   onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={`Client secret${secretSet ? ' (stored)' : ' (blank for a public app)'}`}>
            <input className="admin-input" type="password" value={form.clientSecret}
                   onChange={(e) => set({ clientSecret: e.target.value })}
                   placeholder={secretSet ? 'Leave blank to keep' : ''} autoComplete="new-password" />
          </Field>
          <Field label="Extra scopes (optional)">
            <input className="admin-input" value={form.extraScopes}
                   onChange={(e) => set({ extraScopes: e.target.value })} placeholder="read-repos" />
          </Field>
        </div>

        {secretSet && (
          <button onClick={() => save({ clearSecret: true })} disabled={busy}
                  className="text-[15px] underline mt-[12px] text-[color:var(--bad)]">
            Remove the stored secret (make it a public app)
          </button>
        )}
      </section>

      <section className="p-card p-[22px] mb-[18px]">
        <label className="flex items-start gap-[12px] mb-[16px]">
          <input type="checkbox" className="mt-[4px]" checked={form.tokenSignIn}
                 onChange={(e) => set({ tokenSignIn: e.target.checked })} />
          <span>
            <b className="text-[17px]">Also accept a pasted access token</b>
            <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
              For networks where the redirect cannot come back. The token identifies the account and
              is never stored.
            </span>
          </span>
        </label>
        <p className="text-[15px] text-[color:var(--paper-ink-3)]">
          The button never creates an account. A member of staff signs in once with their username;
          from then on the Hub profile is linked to it by the matching verified address.
        </p>
      </section>

      <div className="flex items-center gap-[16px]">
        <button onClick={() => save()} disabled={busy} className="p-btn">
          {busy ? 'Working…' : 'Save settings'}
        </button>
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
