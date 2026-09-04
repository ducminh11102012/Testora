import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brandingOf, orgs, settingsOf, tests } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import BrandMark from '@/components/ui/BrandMark';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const org = await orgs.bySlug(params.slug);
  return { title: org ? org.name : 'Organisation' };
}

/** The branded front door for a school or centre. */
export default async function OrgLanding({ params }: { params: { slug: string } }) {
  const org = await orgs.bySlug(params.slug);
  if (!org) notFound();

  const branding = brandingOf(org);
  const settings = settingsOf(org);
  const published = await tests.publishedOrg(org.id);

  return (
    <BrandScope branding={branding}>
      <div className="min-h-screen flex flex-col">
        <header className="px-[28px] h-[92px] flex items-center border-b border-[color:var(--line)]">
          <BrandMark branding={branding} size="lg" showTagline />
        </header>

        <main className="flex-1 max-w-[880px] w-full mx-auto px-[28px] py-[64px]">
          <h1 className="text-[42px] font-semibold mb-[14px] text-balance">{org.name}</h1>
          <p className="text-[19px] text-[color:var(--paper-ink-2)] mb-[40px] max-w-[62ch]">
            Examinations for {org.name} are sat here. Sign in with the account your centre issued, or
            enter the code printed on your exam slip.
          </p>

          <div className="flex flex-wrap gap-[14px] mb-[52px]">
            <Link href="/login" className="px-[26px] h-[56px] leading-[56px] rounded-[4px] text-white text-[18px]"
                  style={{ background: 'var(--brand)' }}>
              Sign in
            </Link>
            <Link href="/join" className="px-[26px] h-[56px] leading-[56px] rounded-[4px] border border-[color:var(--line-strong)] text-[18px]">
              Enter an exam code
            </Link>
            {settings.allowSelfSignup && (
              <Link href="/signup" className="px-[26px] h-[56px] leading-[56px] rounded-[4px] border border-[color:var(--line-strong)] text-[18px]">
                Register
              </Link>
            )}
          </div>

          {published.length > 0 && (
            <>
              <h2 className="text-[24px] font-semibold mb-[14px]">Papers in this centre</h2>
              <ul className="space-y-[10px]">
                {published.map((t) => (
                  <li key={t.id} className="border border-[color:var(--line)] rounded-[6px] px-[20px] py-[16px] flex items-baseline justify-between gap-[16px]">
                    <span className="text-[18px]">{t.title}</span>
                    <span className="text-[15px] text-[color:var(--paper-ink-3)] shrink-0">{t.durationMin} min · {t.module}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>

        <footer className="border-t border-[color:var(--line)] px-[28px] py-[22px] text-[15px] text-[color:var(--paper-ink-3)]">
          Assessment delivered on {brandingOf(await orgs.platform()).wordmark}.
        </footer>
      </div>
    </BrandScope>
  );
}
