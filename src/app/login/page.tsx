import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import BrandScope from '@/components/BrandScope';
import { platformBranding } from '@/lib/context';
import { loadHfAuth, publicHfAuth } from '@/lib/auth-hf/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const branding = await platformBranding();
  const hf = publicHfAuth(await loadHfAuth());
  return (
    <BrandScope branding={branding}>
      <Suspense><AuthForm mode="login" branding={branding} hf={hf} /></Suspense>
    </BrandScope>
  );
}
