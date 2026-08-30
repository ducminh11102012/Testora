import { requireStaff } from '@/lib/context';
import BrandingEditor from '@/components/admin/BrandingEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Branding' };

export default async function BrandingPage() {
  const { org, branding, settings } = await requireStaff();
  return <BrandingEditor orgName={org.name} orgSlug={org.slug} branding={branding} settings={settings} />;
}
