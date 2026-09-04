import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import BrandScope from '@/components/BrandScope';
import { platformBranding } from '@/lib/context';
import { verificationRequired } from '@/lib/mail/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account' };

export default async function SignupPage() {
  const branding = await platformBranding();
  const mailOn = await verificationRequired();
  return (
    <BrandScope branding={branding}>
      {/* No Hub button here: candidates sign up with a username, staff are
          created by an administrator. */}
      <Suspense><AuthForm mode="signup" branding={branding} mailOn={mailOn} /></Suspense>
    </BrandScope>
  );
}
