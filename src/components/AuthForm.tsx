'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Branding } from '@/types/db';
import BrandMark from './ui/BrandMark';

type Mode = 'login' | 'signup';

export default function AuthForm({
  mode, branding, orgName, orgSlug,
}: {
  mode: Mode; branding: Branding; orgName?: string; orgSlug?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ login: '', password: '', email: '', displayName: '', code: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reason = params.get('reason');
  const notice = reason === 'expired'
    ? 'Your session has expired. Please sign in again to continue.'
    : reason === 'auth'
      ? 'To see that page you need to sign in first.'
      : null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = mode === 'login'
      ? { login: form.login, password: form.password }
      : { email: form.email, password: form.password, displayName: form.displayName, code: form.code, orgSlug };

    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); return; }
    router.push(data.role === 'candidate' ? '/dashboard' : '/admin');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <div
        className="hidden md:flex md:w-[44%] flex-col justify-between p-[48px] text-white"
        style={{ background: 'var(--brand)' }}
      >
        <div className="opacity-95"><BrandMark branding={{ ...branding, primary: '#ffffff' }} size="lg" /></div>
        <div>
          <p className="text-[28px] leading-[1.35] font-medium max-w-[24ch]">
            {orgName
              ? `${orgName} runs its examinations on this platform.`
              : 'Sit your paper on screen, and get the marked answer review the moment you submit.'}
          </p>
        </div>
        <p className="text-[15px] opacity-80">Keep this window open for the whole exam.</p>
      </div>

      <div className="flex-1 px-[24px] md:px-[72px] py-[56px] overflow-y-auto">
        <div className="w-full max-w-[560px]">
          <div className="md:hidden mb-[40px]"><BrandMark branding={branding} /></div>

          <h1 className="text-[38px] leading-tight font-normal mb-[10px]">
            {mode === 'login' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="text-[18px] text-[#5e5e5e] mb-[32px]">
            {orgName ? `You are signing in to ${orgName}.` : mode === 'login'
              ? 'Use the username or email your centre gave you.'
              : 'You can start with the free papers straight away.'}
          </p>

          {notice && (
            <div className="border rounded-[4px] px-[22px] py-[16px] text-[17px] mb-[28px]"
                 style={{ backgroundColor: '#FFFCF0', borderColor: '#EFE3B0' }}>
              {notice}
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-[18px]">
            {mode === 'signup' && (
              <Field label="Full name">
                <input required value={form.displayName} onChange={set('displayName')} className="auth-input" autoComplete="name" />
              </Field>
            )}

            <Field label={mode === 'login' ? 'Username or email' : 'Email'}>
              <input
                required
                value={mode === 'login' ? form.login : form.email}
                onChange={mode === 'login' ? set('login') : set('email')}
                className="auth-input"
                autoComplete={mode === 'login' ? 'username' : 'email'}
                type={mode === 'login' ? 'text' : 'email'}
              />
            </Field>

            <Field label="Password">
              <input required type="password" value={form.password} onChange={set('password')} className="auth-input"
                     autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>

            {mode === 'signup' && (
              <Field label="Access code (optional)">
                <input value={form.code} onChange={set('code')} className="auth-input"
                       placeholder="From your school or a purchase" />
              </Field>
            )}

            {error && <p role="alert" className="text-[17px] text-[color:var(--bad)]">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="px-[34px] h-[58px] text-[18px] text-white rounded-[4px] disabled:opacity-60"
              style={{ background: 'var(--brand)' }}
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <hr className="mt-[44px] mb-[24px] border-t border-[#DDDDDD]" />

          <p className="text-[17px]">
            {mode === 'login' ? (
              <>New here? <Link href="/signup" className="underline">Create an account</Link> · Have an exam code?{' '}
                <Link href="/join" className="underline">Enter it here</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="underline">Sign in</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[15px] font-semibold mb-[7px]">{label}</span>
      {children}
    </label>
  );
}
