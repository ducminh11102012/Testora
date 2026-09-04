import Link from 'next/link';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs, suites, tests, users } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill } from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import StartTestButton from '@/components/StartTestButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practice catalogue' };

export default async function Catalogue() {
  const user = await readSession();
  const branding = brandingOf(await orgs.platform());
  const account = user ? await users.byId(user.id) : null;
  const papers = await tests.catalogue();
  const fullTests = await suites.catalogue();

  // The catalogue is filed too: a book of practice papers is one folder, a set
  // of mocks another, and anything unfiled keeps the top of the page.
  const folders = new Map<string, typeof papers>();
  for (const paper of papers) {
    const name = paper.folder?.trim() || '';
    folders.set(name, [...(folders.get(name) ?? []), paper]);
  }
  const grouped = [...folders.entries()].sort((a, b) => {
    if (!a[0]) return -1;
    if (!b[0]) return 1;
    return a[0].localeCompare(b[0]);
  });

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
        <p className="text-[18px] text-[color:var(--paper-ink-3)] mb-[34px] max-w-[70ch]">
          Free papers open straight away. Paid papers cost credits, which you get from an access code
          your centre issues or from a top-up.
        </p>

        {fullTests.length > 0 && (
          <>
            <h2 className="text-[24px] font-semibold mb-[16px]">Full tests</h2>
            <div className="grid gap-[16px] md:grid-cols-3 mb-[40px]">
              {fullTests.map((s) => (
                <Link key={s.id} href={user ? `/suite/${s.id}` : '/signup'}
                      className="border border-[color:var(--line)] rounded-[6px] p-[22px] hover:border-[color:var(--line-strong)] transition-colors">
                  <div className="flex items-center gap-[10px] mb-[12px] flex-wrap">
                    <Pill tone="brand">Full test</Pill>
                    <Pill tone={s.priceCredits === 0 ? 'good' : 'neutral'}>
                      {s.priceCredits === 0 ? 'Free' : `${s.priceCredits} credit${s.priceCredits === 1 ? '' : 's'}`}
                    </Pill>
                  </div>
                  <h3 className="text-[21px] font-semibold mb-[8px] leading-snug">{s.title}</h3>
                  <p className="text-[15px] text-[color:var(--paper-ink-3)]">
                    {suites.itemsOf(s).map((i) => i.skill).join(' · ')}
                    {s.folder ? ` · ${s.folder}` : ''}
                  </p>
                </Link>
              ))}
            </div>
            <h2 className="text-[24px] font-semibold mb-[16px]">Single papers</h2>
          </>
        )}

        {papers.length === 0 ? (
          <p className="text-[18px] text-[color:var(--paper-ink-3)]">The catalogue is empty at the moment.</p>
        ) : grouped.map(([folderName, inFolder]) => (
          <section key={folderName || 'unfiled'} className="mb-[32px]">
            {grouped.length > 1 && (
              <h3 className="text-[19px] font-semibold mb-[12px]">
                {folderName || 'Single papers'}
                <span className="ml-[10px] text-[16px] font-normal text-[color:var(--paper-ink-3)]">
                  {inFolder.length} paper{inFolder.length === 1 ? '' : 's'}
                </span>
              </h3>
            )}
          <div className="grid gap-[16px] md:grid-cols-3">
            {inFolder.map((t) => (
                <div key={t.id} className="border border-[color:var(--line)] rounded-[6px] p-[22px] flex flex-col">
                  <div className="flex items-center gap-[10px] mb-[12px] flex-wrap">
                    <Pill tone="brand">{t.module}</Pill>
                    <Pill tone={t.priceCredits === 0 ? 'good' : 'neutral'}>
                      {t.priceCredits === 0 ? 'Free' : `${t.priceCredits} credit${t.priceCredits === 1 ? '' : 's'}`}
                    </Pill>
                  </div>
                  <h2 className="text-[21px] font-semibold mb-[8px] leading-snug">{t.title}</h2>
                  <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[20px]">
                    {t.questionCount ?? 0} questions
                    {t.durationMin > 0 ? ` · ${t.durationMin} minutes` : ' · no time limit'}
                    {t.hasAudio === 1 ? ' · with a recording' : ''}
                    {t.summary ? ` · ${t.summary}` : ''}
                  </p>
                  <div className="mt-auto">
                    {user
                      ? <StartTestButton testId={t.id} priceCredits={t.priceCredits} />
                      : <Link href="/signup" className="inline-block px-[24px] h-[50px] leading-[50px] text-white text-[17px] rounded-[4px]"
                              style={{ background: 'var(--brand)' }}>Sign up to sit this</Link>}
                  </div>
                </div>
            ))}
          </div>
          </section>
        ))}
      </main>
    </BrandScope>
  );
}
