import { Branding } from '@/types/db';
import { brandVars } from '@/lib/brand';

/**
 * Applies an organisation's palette to everything inside it. Every surface
 * reads the same custom properties, so one wrapper rebrands the exam, the
 * console and the public pages alike.
 */
export default function BrandScope({
  branding, children, className = '', asMain = false,
}: {
  branding: Branding;
  children: React.ReactNode;
  className?: string;
  asMain?: boolean;
}) {
  const style = brandVars(branding) as React.CSSProperties;
  const Tag = asMain ? 'main' : 'div';
  return <Tag style={style} className={className}>{children}</Tag>;
}
