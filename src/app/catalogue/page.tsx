import Link from 'next/link';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs, tests, users } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill } from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import StartTestButton from '@/components/StartTestButton';
import { ExamContent, totalQuestions } from '@/types/exam';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practice catalogue' };

export default async function Catalogue() {
  const user = await readSession();
  const branding = brandingOf(orgs.platform());
  const account = user ? users.byId(user.id) : null;
  const papers = tests.catalogue();

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Practice catalogue"
        right={user ? (
          <>
            <Pill tone="brand">{account?.credits ?? 0} credits</Pill>
            <Link href="/dashboard" className="hover:underline">Your tests</Link>
            <Link href="/join" className="hover:underline">Enter a code</Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="hover:underline">Sign in</Link>
            <Link href="/signup" className="px-[18px] h-[42px] leading-[42px] rounded-[4px] text-white"
                  style={{ background: 'var(--brand)' }}>Create an account</Link>
          </>
        )}
      />

      <main className="max-w-[1180px] mx-auto px-[28px] py-[44px]">
        <h1 className="text-[34px] font-semibold mb-[8px]">Practice papers</h1>
        <p className="text-[18px] text-[#5e5e5e] mb-[34px] max-w-[70ch]">
          Free papers open straight away. Paid papers cost credits, which you get from an access code
          your centre issues or from a top-up.
        </p>

        {papers.length === 0 ? (
          <p className="text-[18px] text-[#5e5e5e]">The catalogue is empty at the moment.</p>
        ) : (
          <div className="grid gap-[16px] md:grid-cols-3">
            {papers.map((t) => {
              const content = JSON.parse(t.content) as ExamContent;
              return (
                <div key={t.id} className="border border-[#dcdcdc] rounded-[6px] p-[22px] flex flex-col">
                  <div className="flex items-center gap-[10px] mb-[12px] flex-wrap">
                    <Pill tone="brand">{t.module}</Pill>
                    <Pill tone={t.priceCredits === 0 ? 'good' : 'neutral'}>
                      {t.priceCredits === 0 ? 'Free' : `${t.priceCredits} credit${t.priceCredits === 1 ? '' : 's'}`}
                    </Pill>
                  </div>
                  <h2 className="text-[21px] font-semibold mb-[8px] leading-snug">{t.title}</h2>
                  <p className="text-[15px] text-[#5e5e5e] mb-[20px]">
                    {totalQuestions(content)} questions · {t.durationMin} minutes
                    {content.description ? ` · ${content.description}` : ''}
                  </p>
                  <div className="mt-auto">
                    {user
                      ? <StartTestButton testId={t.id} priceCredits={t.priceCredits} />
                      : <Link href="/signup" className="inline-block px-[24px] h-[50px] leading-[50px] text-white text-[17px] rounded-[4px]"
                              style={{ background: 'var(--brand)' }}>Sign up to sit this</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </BrandScope>
  );
}
