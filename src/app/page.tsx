import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { brandingOf, orgs, tests } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import { BookIcon, KeyIcon, UsersIcon } from '@/components/ui/Icons';
import { ExamContent, totalQuestions } from '@/types/exam';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const user = await readSession();
  if (user) redirect(user.role === 'candidate' ? '/dashboard' : '/admin');

  const platform = orgs.platform();
  const branding = brandingOf(platform);
  const catalogue = tests.catalogue().slice(0, 6);

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        right={
          <>
            <Link href="/join" className="hover:underline">Have a code?</Link>
            <Link href="/login" className="hover:underline">Sign in</Link>
            <Link
              href="/signup"
              className="px-[18px] h-[42px] leading-[42px] rounded-[4px] text-white"
              style={{ background: 'var(--brand)' }}
            >
              Create an account
            </Link>
          </>
        }
      />

      <main>
        <section className="px-[28px] py-[72px] max-w-[1180px] mx-auto">
          <p className="text-[15px] font-semibold uppercase tracking-[0.14em] mb-[18px]" style={{ color: 'var(--brand)' }}>
            {branding.tagline}
          </p>
          <h1 className="text-[46px] sm:text-[58px] leading-[1.08] font-semibold max-w-[19ch] mb-[24px] text-balance">
            Run real exams on screen, and mark them the moment they end.
          </h1>
          <p className="text-[20px] leading-[1.6] max-w-[62ch] text-[#3d3d3d] mb-[36px]">
            Upload a paper as Word or PDF and it becomes an interactive test — reading passages with
            highlighting, listening with a single-play recording, cloze, error correction, word
            formation and writing. Learners sit it in the browser; the objective sections mark
            themselves.
          </p>
          <div className="flex flex-wrap gap-[14px]">
            <Link
              href="/catalogue"
              className="px-[24px] h-[54px] leading-[54px] rounded-[4px] text-white text-[18px]"
              style={{ background: 'var(--brand)' }}
            >
              Browse practice tests
            </Link>
            <Link href="/join" className="px-[24px] h-[54px] leading-[54px] rounded-[4px] border border-[#8f8f8f] text-[18px]">
              Enter an exam code
            </Link>
          </div>
        </section>

        <section className="px-[28px] pb-[64px] max-w-[1180px] mx-auto grid gap-[18px] md:grid-cols-3">
          <Feature
            icon={<BookIcon size={26} />}
            title="For learners"
            body="Buy or redeem a code, sit the paper on any machine, and see the marked answer review straight away."
          />
          <Feature
            icon={<UsersIcon size={26} />}
            title="For schools and centres"
            body="Your own space with your logo and colours, your paper bank, your classes, scheduled sittings and results by cohort."
          />
          <Feature
            icon={<KeyIcon size={26} />}
            title="Sittings you control"
            body="Open and close times, an access code per sitting, paste blocking and focus tracking, and a marking queue for writing."
          />
        </section>

        {catalogue.length > 0 && (
          <section className="px-[28px] pb-[90px] max-w-[1180px] mx-auto">
            <h2 className="text-[30px] font-semibold mb-[20px]">In the catalogue</h2>
            <div className="grid gap-[16px] md:grid-cols-3">
              {catalogue.map((t) => {
                const content = JSON.parse(t.content) as ExamContent;
                return (
                  <Link
                    key={t.id}
                    href="/catalogue"
                    className="border border-[#e3e3e3] rounded-[6px] p-[22px] hover:border-[#8f8f8f] transition-colors"
                  >
                    <div className="text-[13px] uppercase tracking-wide font-semibold mb-[10px]" style={{ color: 'var(--brand)' }}>
                      {t.module}
                    </div>
                    <h3 className="text-[20px] font-semibold mb-[10px] leading-snug">{t.title}</h3>
                    <p className="text-[15px] text-[#5e5e5e]">
                      {totalQuestions(content)} questions · {t.durationMin} minutes ·{' '}
                      {t.priceCredits === 0 ? 'Free' : `${t.priceCredits} credit${t.priceCredits === 1 ? '' : 's'}`}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[#e4e4e4] px-[28px] py-[28px] text-[15px] text-[#5e5e5e]">
        {branding.wordmark} · an independent assessment platform. Not affiliated with, or endorsed by,
        any examination board.
      </footer>
    </BrandScope>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="border border-[#e3e3e3] rounded-[6px] p-[24px]">
      <div className="mb-[14px]" style={{ color: 'var(--brand)' }}>{icon}</div>
      <h3 className="text-[20px] font-semibold mb-[8px]">{title}</h3>
      <p className="text-[16px] leading-[1.6] text-[#3d3d3d]">{body}</p>
    </div>
  );
}
