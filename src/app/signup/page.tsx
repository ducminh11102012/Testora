import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import BrandScope from '@/components/BrandScope';
import { platformBranding } from '@/lib/context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account' };

export default function SignupPage() {
  const branding = platformBranding();
  return (
    <BrandScope branding={branding}>
      <Suspense><AuthForm mode="signup" branding={branding} /></Suspense>
    </BrandScope>
  );
}
