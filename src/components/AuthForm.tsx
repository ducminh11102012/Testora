'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Branding } from '@/types/db';
import BrandMark from './ui/BrandMark';

type Mode = 'login' | 'signup';

export default function AuthForm({
  mode, branding, orgName, orgSlug, mailOn = false, hf = { oauth: false, token: false },
}: {
  mode: Mode; branding: Branding; orgName?: string; orgSlug?: string;
  /** With a mail server configured, signing up needs an address to send a code to. */
  mailOn?: boolean;
  /** Which Hugging Face routes in are switched on. */
  hf?: { oauth: boolean; token: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    login: '', password: '', email: '', username: '', displayName: '', code: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reason = params.get('reason');
  const notice = reason === 'expired'
    ? 'Your session has expired. Please sign in again to continue.'
    : reason === 'auth'
      ? 'To see that page you need to sign in first.'
      : reason === 'hf-failed'
        ? `Hugging Face sign-in did not finish. ${params.get('detail') ?? ''}`.trim()
        : reason === 'hf-off'
          ? 'Hugging Face sign-in is switched off on this platform.'
          : null;

  // The Hub button is an administrator's door, so it only appears on the staff
  // sign-in — never on the screen a candidate is sent to.
  const staffView = mode === 'login' && params.get('staff') === '1';

  const [hfToken, setHfToken] = useState('');
  const [hfOpen, setHfOpen] = useState(false);
  const [hfBusy, setHfBusy] = useState(false);

  async function signInWithToken(e: React.FormEvent) {
    e.preventDefault();
    setHfBusy(true); setError(null);
    const res = await fetch('/api/auth/hf/token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: hfToken }),
    });
    const data = await res.json().catch(() => ({}));
    setHfBusy(false);
    if (!res.ok) { setError(data.error ?? 'That token was not accepted.'); return; }
    router.push(data.role === 'candidate' ? '/dashboard' : '/admin');
    router.refresh();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = mode === 'login'
      ? { login: form.login, password: form.password }
      : {
        email: form.email, username: form.username, password: form.password,
        displayName: form.displayName, code: form.code, orgSlug,
      };

    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.setup) { router.push('/setup'); return; }
      setError(data.error ?? 'Something went wrong. Please try again.');
      return;
    }
    router.push(data.verify ? '/verify' : data.role === 'candidate' ? '/dashboard' : '/admin');
    router.refresh();
  }

  return (
    <div className="insp-split">
      {/* The candidate portal keeps a plain grey field beside the form: no
          marketing, nothing to read, nothing to click by mistake. */}
      <div className="insp-rail" aria-hidden="true" />

      <div className="insp-panel px-[24px] sm:px-[56px] py-[40px] overflow-y-auto">
        <div className="w-full max-w-[720px]">
          <div className="mb-[56px]">
            <Link href="/" aria-label={branding.wordmark}>
              <BrandMark branding={branding} tone="brand" />
            </Link>
          </div>

          <h1 className="text-[40px] leading-[1.2] font-normal mb-[22px]">
            {mode === 'login'
              ? orgName ? `Welcome to ${orgName}` : 'Welcome to Candidate login!'
              : 'Create your candidate account'}
          </h1>

          {notice && <div className="insp-notice mb-[30px]" role="status">{notice}</div>}

          {!notice && (
            <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[30px]">
              {orgName ? `You are signing in to ${orgName}.` : mode === 'login'
                ? 'Use the username or email your centre gave you.'
                : 'You can start with the free papers straight away.'}
            </p>
          )}

          {(hf.oauth || hf.token) && staffView && (
            <div className="max-w-[560px] mb-[26px]">
              <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[12px]">
                For staff accounts. Candidates sign in with the username their centre issued.
              </p>
              {hf.oauth && (
                <a href="/api/auth/hf/start" className="p-btn-ghost w-full sm:w-auto">
                  <HuggingFaceMark />
                  {mode === 'login' ? 'Continue with Hugging Face' : 'Sign up with Hugging Face'}
                </a>
              )}
              {hf.token && (
                <div className={hf.oauth ? 'mt-[12px]' : ''}>
                  <button type="button" className="p-link text-[15px]" onClick={() => setHfOpen((o) => !o)}>
                    {hfOpen ? 'Use a username instead' : 'Use a Hugging Face access token'}
                  </button>
                  {hfOpen && (
                    <form onSubmit={signInWithToken} className="mt-[12px] flex flex-wrap gap-[10px] items-center">
                      <input
                        className="p-input max-w-[340px]" type="password" value={hfToken}
                        onChange={(e) => setHfToken(e.target.value)} placeholder="hf_…"
                        autoComplete="off" spellCheck={false}
                      />
                      <button type="submit" disabled={hfBusy || !hfToken} className="p-btn">
                        {hfBusy ? 'Checking…' : 'Sign in'}
                      </button>
                    </form>
                  )}
                </div>
              )}
              <div className="flex items-center gap-[14px] mt-[22px] text-[14px] text-[color:var(--paper-ink-3)]">
                <span className="flex-1 h-px bg-[color:var(--line)]" />
                or
                <span className="flex-1 h-px bg-[color:var(--line)]" />
              </div>
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-[16px] max-w-[560px]">
            {mode === 'signup' && (
              <Field label="Full name">
                <input required value={form.displayName} onChange={set('displayName')} className="p-input" autoComplete="name" />
              </Field>
            )}

            {mode === 'login' ? (
              <Field label="Username or email">
                <input
                  required value={form.login} onChange={set('login')} className="p-input"
                  placeholder="Enter your username" autoComplete="username" type="text"
                />
              </Field>
            ) : mailOn ? (
              <Field label="Email">
                <input
                  required type="email" value={form.email} onChange={set('email')} className="p-input"
                  placeholder="Enter your email" autoComplete="email"
                />
                <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[7px]">
                  We send a six-digit code here to confirm the address.
                </p>
              </Field>
            ) : (
              <>
                <Field label="Username">
                  <input
                    required value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                    className="p-input" placeholder="Pick a username" autoComplete="username" spellCheck={false}
                  />
                  <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[7px]">
                    This platform has no mail server, so a username and a password are all you need.
                  </p>
                </Field>
                <Field label="Email (optional)">
                  <input type="email" value={form.email} onChange={set('email')} className="p-input" autoComplete="email" />
                </Field>
              </>
            )}

            <Field label="Password">
              <input required type="password" value={form.password} onChange={set('password')} className="p-input"
                     placeholder="Password"
                     autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>

            {mode === 'signup' && (
              <Field label="Join or access code (optional)">
                <input value={form.code} onChange={set('code')} className="p-input"
                       style={{ textTransform: 'uppercase' }}
                       autoComplete="off" spellCheck={false}
                       placeholder="Your school's join code, or a code you bought" />
                <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[7px]">
                  A join code puts your account inside that organisation. Leave it blank and you still
                  get the free shared bank.
                </p>
              </Field>
            )}

            {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}

            <div className="pt-[6px]">
              <button type="submit" disabled={busy} className="p-btn">
                {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
              </button>
            </div>
          </form>

          <hr className="p-rule mt-[40px] mb-[22px] max-w-[560px]" />

          <p className="text-[17px] text-[color:var(--paper-ink-2)] max-w-[560px]">
            {mode === 'login' ? (
              <>Trouble logging in? Please refer to your registration email, or{' '}
                <Link href="/signup" className="p-link">create an account</Link>. Have an exam code?{' '}
                <Link href="/join" className="p-link">Enter it here</Link>. A school or centre?{' '}
                <Link href="/apply" className="p-link">Apply for your own space</Link>.</>
            ) : (
              <>Already have an account? <Link href="/login" className="p-link">Sign in</Link>. Setting up
                for a school? <Link href="/apply" className="p-link">Apply for an organisation</Link>.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The Hub's mark, drawn rather than fetched so the page stays self-contained. */
function HuggingFaceMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#FFD21E" />
      <circle cx="11" cy="14" r="1.7" fill="#3A3B45" />
      <circle cx="21" cy="14" r="1.7" fill="#3A3B45" />
      <path d="M10.5 19.5c1.6 2.4 3.6 3.6 5.5 3.6s3.9-1.2 5.5-3.6"
            stroke="#3A3B45" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
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
