import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { brandingOf, databaseReady, orgs } from '@/lib/db';
import { brandStyleString } from '@/lib/brand';
import { gateRedirect } from '@/lib/gate';
import { DEFAULT_BRANDING } from '@/lib/defaults';
import DatabaseNotice from '@/components/DatabaseNotice';
import { brandVars } from '@/lib/brand';
import './globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // The title must survive a deployment with no database attached yet.
  const platform = await orgs.platform().catch(() => null);
  const branding = platform ? brandingOf(platform) : DEFAULT_BRANDING;
  return {
    title: { default: branding.wordmark, template: `%s · ${branding.wordmark}` },
    description: branding.tagline ?? 'Assessment platform',
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nothing works without storage, so that is the first thing checked — and the
  // answer is a page with instructions rather than a stack trace.
  const db = await databaseReady();

  // First run, and the email gate: both live here because the root layout is
  // the only place that renders on every page.
  const target = db.ok ? await gateRedirect() : null;
  if (target) redirect(target);

  // Platform defaults; an organisation's own palette is applied further down
  // the tree by BrandScope so one deployment can serve many brands.
  const platform = db.ok ? await orgs.platform() : null;
  const style = brandStyleString(platform ? brandingOf(platform) : DEFAULT_BRANDING);
  return (
    <html lang="en" data-textsize="medium" data-contrast="default" style={{ cssText: style } as never} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href={
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800'
            + '&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600&display=swap'
          }
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `:root{${style}}` }} />
      </head>
      <body>
        {db.ok
          ? children
          : (
            <div style={brandVars(DEFAULT_BRANDING) as React.CSSProperties}>
              <DatabaseNotice reason={db.reason} error={db.error} />
            </div>
          )}
      </body>
    </html>
  );
}
