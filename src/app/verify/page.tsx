import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs, users } from '@/lib/db';
import { verificationRequired } from '@/lib/mail/config';
import BrandScope from '@/components/BrandScope';
import VerifyForm from '@/components/VerifyForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Confirm your email' };

export default async function VerifyPage() {
  const session = await readSession();
  if (!session) redirect('/login?reason=auth');

  const account = await users.byId(session.id);
  if (!account) redirect('/login?reason=auth');

  const needed = await verificationRequired();
  const done = !!account.email && !!account.emailVerifiedAt;
  if (!needed || done) redirect(session.role === 'candidate' ? '/dashboard' : '/admin');

  const branding = brandingOf(await orgs.byId(session.orgId));
  return (
    <BrandScope branding={branding}>
      <VerifyForm branding={branding} email={account.email ?? ''} name={account.displayName} />
    </BrandScope>
  );
}
