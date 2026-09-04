import { redirect } from 'next/navigation';
import { setupStep } from '@/lib/gate';
import { loadHfAuth } from '@/lib/auth-hf/config';
import { DEFAULT_BRANDING } from '@/lib/defaults';
import BrandScope from '@/components/BrandScope';
import SetupForm from '@/components/SetupForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up this platform' };

export default async function SetupPage({ searchParams }: {
  searchParams: { connected?: string };
}) {
  const step = await setupStep();
  if (!step) redirect('/');
  // The redirect route only exists when an OAuth application is configured.
  const hfConnect = !!(process.env.HF_OAUTH_CLIENT_ID || (await loadHfAuth()).clientId);
  return (
    <BrandScope branding={DEFAULT_BRANDING}>
      <SetupForm
        branding={DEFAULT_BRANDING}
        step={step}
        hfConnect={hfConnect}
        connected={searchParams.connected}
      />
    </BrandScope>
  );
}
