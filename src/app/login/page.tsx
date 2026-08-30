import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import BrandScope from '@/components/BrandScope';
import { platformBranding } from '@/lib/context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  const branding = platformBranding();
  return (
    <BrandScope branding={branding}>
      <Suspense><AuthForm mode="login" branding={branding} /></Suspense>
    </BrandScope>
  );
}
