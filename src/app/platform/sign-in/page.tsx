import Link from 'next/link';
import { headers } from 'next/headers';
import { requirePlatformAdmin } from '@/lib/context';
import { brandingOf, orgs, orgApplications } from '@/lib/db';
import { loadHfAuth, publicHfAuth } from '@/lib/auth-hf/config';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import PlatformNav from '@/components/PlatformNav';
import SignInSettings from '@/components/admin/SignInSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign-in' };

export default async function SignInPage() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const config = await loadHfAuth();

  // The exact redirect URI to register with the Hub, taken from this request.
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const callbackUrl = `${proto}://${host}/api/auth/hf/callback`;

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/sign-in" pending={pending} />
        <SignInSettings initial={publicHfAuth(config)} clientId={config.clientId} callbackUrl={callbackUrl} />
      </main>
    </BrandScope>
  );
}
