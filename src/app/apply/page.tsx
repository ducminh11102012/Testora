import ApplyForm from '@/components/ApplyForm';
import BrandScope from '@/components/BrandScope';
import { platformBranding } from '@/lib/context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apply for an organisation' };

export default async function ApplyPage() {
  const branding = await platformBranding();
  return (
    <BrandScope branding={branding}>
      <ApplyForm branding={branding} />
    </BrandScope>
  );
}
