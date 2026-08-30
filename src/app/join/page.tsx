import { Suspense } from 'react';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import JoinForm from '@/components/JoinForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Enter an exam code' };

export default async function JoinPage() {
  const user = await readSession();
  const branding = brandingOf(user ? orgs.byId(user.orgId) : orgs.platform());
  return (
    <BrandScope branding={branding}>
      <PageHeader branding={branding} subtitle="Enter a code" href={user ? '/dashboard' : '/'} />
      <main className="max-w-[640px] mx-auto px-[28px] py-[64px]">
        <h1 className="text-[34px] font-semibold mb-[10px]">Enter your code</h1>
        <p className="text-[18px] text-[#5e5e5e] mb-[32px]">
          An exam code takes you straight into a scheduled sitting. A credit code adds papers to your account.
        </p>
        <Suspense><JoinForm signedIn={!!user} /></Suspense>
      </main>
    </BrandScope>
  );
}
