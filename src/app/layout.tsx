import type { Metadata, Viewport } from 'next';
import { brandingOf, orgs } from '@/lib/db';
import { brandStyleString } from '@/lib/brand';
import './globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const branding = brandingOf(orgs.platform());
  return {
    title: { default: branding.wordmark, template: `%s · ${branding.wordmark}` },
    description: branding.tagline ?? 'Assessment platform',
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Platform defaults; an organisation's own palette is applied further down
  // the tree by BrandScope so one deployment can serve many brands.
  const style = brandStyleString(brandingOf(orgs.platform()));
  return (
    <html lang="en" data-textsize="medium" data-contrast="default" style={{ cssText: style } as never} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `:root{${style}}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
