import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { SuiteItem, brandingOf, orgs, suites, tests } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import { BrandGlyph } from '@/components/ui/BrandMark';
import { ExamContent, totalQuestions } from '@/types/exam';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const user = await readSession();
  if (user) redirect(user.role === 'candidate' ? '/dashboard' : '/admin');

  const platform = await orgs.platform();
  const branding = brandingOf(platform);
  const catalogueTests = (await tests.catalogue()).slice(0, 3);
  const catalogueSuites = (await suites.catalogue()).slice(0, 2);

  return (
    <BrandScope branding={branding}>
      {/* ------------------------------------------------------ masthead */}
      <header className="border-b border-[color:var(--line)]">
        <div className="mx-auto max-w-[1120px] px-[26px] h-[76px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-[11px]" aria-label={branding.wordmark}>
            <BrandGlyph size={26} color="var(--brand)" />
            <span className="text-[20px] tracking-[-0.01em] font-semibold" style={{ color: 'var(--brand)' }}>
              {branding.wordmark}
            </span>
          </Link>
          <nav className="flex items-center gap-[22px] text-[15px]">
            <Link href="/catalogue" className="hidden sm:inline hover:underline underline-offset-4">Papers</Link>
            <Link href="/join" className="hidden sm:inline hover:underline underline-offset-4">Have a code?</Link>
            <Link href="/login" className="hover:underline underline-offset-4">Sign in</Link>
            <Link href="/apply" className="p-link mr-[18px] text-[16px]">For schools</Link>
            <Link href="/signup" className="p-btn p-btn-sm">Create an account</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------- hero */}
        <section className="mx-auto max-w-[1120px] px-[26px] pt-[84px] pb-[72px]
                            grid gap-[56px] lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="p-eyebrow mb-[24px]">{branding.tagline}</p>
            <h1 className="p-display text-[46px] sm:text-[60px] max-w-[13ch] mb-[26px]">
              Sit the paper on screen. Get the marks the same day.
            </h1>
            <p className="p-lede max-w-[46ch] mb-[34px]">
              {branding.wordmark} turns a Word or PDF paper into a test candidates take in the
              browser, then marks what can be marked by rule and sends the writing to a teacher, or
              to a model working from your rubric.
            </p>
            <div className="flex flex-wrap gap-[12px]">
              <Link href="/catalogue" className="p-btn">Browse the free bank</Link>
              <Link href="/join" className="p-btn-ghost">Enter an organisation code</Link>
            </div>
          </div>

          {/* A quiet specimen of what a candidate ends up with. */}
          <Specimen />
        </section>

        {/* ------------------------------------------------------- numbers */}
        <section className="border-y border-[color:var(--line)] bg-[color:var(--paper-sunk)]">
          <div className="mx-auto max-w-[1120px] px-[26px] py-[34px] grid gap-[26px] sm:grid-cols-3">
            <Figure n="24" label="question types, from multiple choice to sentence transformation" />
            <Figure n="3" label="skills timed and banded separately in a full IELTS test" />
            <Figure n="1" label="paper bank per organisation, invisible to every other" />
          </div>
        </section>

        {/* ---------------------------------------------------- how it goes */}
        <section className="mx-auto max-w-[1120px] px-[26px] py-[78px]">
          <p className="p-eyebrow mb-[34px]">From file to sitting</p>
          <div className="grid gap-[40px] md:grid-cols-3">
            <Step
              n="01"
              title="Upload the paper"
              body="Word or PDF. The rule engine reads the numbering, the options and the answer key at the back. Anything it cannot place with certainty goes to a model for a second opinion."
            />
            <Step
              n="02"
              title="Check the questions"
              body="The editor shows every part the way the candidate will see it. Fix a gap, move a question between parts, paste the audio link, set the timing."
            />
            <Step
              n="03"
              title="Open the sitting"
              body="Pick a window, hand out an access code, watch the roster fill. Paste blocking and focus tracking are on unless you turn them off."
            />
          </div>
        </section>

        {/* --------------------------------------------------- two audiences */}
        <section className="border-t border-[color:var(--line)]">
          <div className="mx-auto max-w-[1120px] px-[26px] py-[78px] grid gap-[52px] md:grid-cols-2">
            <div>
              <h2 className="p-display text-[32px] mb-[18px]">If you are studying</h2>
              <p className="text-[17px] leading-[1.68] text-[color:var(--paper-ink-2)] mb-[16px]">
                Create an account and the free bank is open to you, with the answer review after each
                paper. A full IELTS test is split by skill, each timed on its own, with the
                instruction video before you start. When the last skill is in, you get a score report
                with a band for every skill and one overall.
              </p>
              <p className="text-[17px] leading-[1.68] text-[color:var(--paper-ink-2)]">
                If your school gave you a join code, type it at sign-up and their papers appear
                alongside the free ones.
              </p>
            </div>
            <div>
              <h2 className="p-display text-[32px] mb-[18px]">If you run a centre</h2>
              <p className="text-[17px] leading-[1.68] text-[color:var(--paper-ink-2)] mb-[16px]">
                Your organisation is a separate space with its own paper bank, classes, sittings and
                results. Put your logo and colours in the settings and candidates never see ours.
                Papers you upload stay yours; nothing crosses into another organisation.
              </p>
              <p className="text-[17px] leading-[1.68] text-[color:var(--paper-ink-2)]">
                Parsing and AI marking are metered. Every call is priced and filed against your
                organisation, so the month-end figure has a line for each paper and each essay.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ catalogue */}
        {(catalogueSuites.length > 0 || catalogueTests.length > 0) && (
          <section className="border-t border-[color:var(--line)]">
            <div className="mx-auto max-w-[1120px] px-[26px] py-[70px]">
              <div className="flex items-baseline justify-between gap-[16px] mb-[26px]">
                <h2 className="p-display text-[32px]">Open to everyone</h2>
                <Link href="/catalogue" className="p-link text-[15px]">See all papers</Link>
              </div>
              <div className="grid gap-[14px] md:grid-cols-3">
                {[...catalogueSuites].slice(0, 1).map((s) => {
                  const items = JSON.parse(s.items) as SuiteItem[];
                  return (
                    <Link key={s.id} href="/catalogue" className="p-card p-card-hover p-[22px] block">
                      <div className="p-eyebrow mb-[12px]">Full test</div>
                      <h3 className="text-[19px] font-semibold mb-[8px] leading-snug">{s.title}</h3>
                      <p className="text-[15px] text-[color:var(--paper-ink-3)]">
                        {items.map((i) => i.skill).join(' · ')} · {s.priceCredits === 0 ? 'Free' : `${s.priceCredits} credits`}
                      </p>
                    </Link>
                  );
                })}
                {catalogueTests.slice(0, 2).map((t) => (
                    <Link key={t.id} href="/catalogue" className="p-card p-card-hover p-[22px] block">
                      <div className="p-eyebrow mb-[12px]">{t.module}</div>
                      <h3 className="text-[19px] font-semibold mb-[8px] leading-snug">{t.title}</h3>
                      <p className="text-[15px] text-[color:var(--paper-ink-3)]">
                        {t.questionCount ?? 0} questions · {t.durationMin} min ·{' '}
                        {t.priceCredits === 0 ? 'Free' : `${t.priceCredits} credits`}
                      </p>
                    </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------- close */}
        <section className="border-t border-[color:var(--line)]">
          <div className="mx-auto max-w-[1120px] px-[26px] py-[84px]">
            <h2 className="p-display text-[40px] max-w-[20ch] mb-[20px]">
              Start with one paper and see how far it gets.
            </h2>
            <p className="text-[17px] leading-[1.68] max-w-[54ch] text-[color:var(--paper-ink-2)] mb-[30px]">
              A new account comes with credits for the free bank and no card. Upload your own paper
              once you have an organisation.
            </p>
            <div className="flex flex-wrap gap-[12px]">
              <Link href="/signup" className="p-btn">Create an account</Link>
              <Link href="/apply" className="p-btn-ghost">Apply for an organisation</Link>
              <Link href="/login" className="p-btn-ghost">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--line)]">
        <div className="mx-auto max-w-[1120px] px-[26px] py-[30px] flex flex-wrap gap-x-[24px] gap-y-[10px] justify-between text-[14px] text-[color:var(--paper-ink-3)]">
          <span>
            {branding.wordmark} · an independent assessment platform. Not affiliated with, or
            endorsed by, any examination board.
          </span>
          <span className="flex gap-[18px]">
            <Link href="/catalogue" className="hover:underline underline-offset-4">Papers</Link>
            <Link href="/join" className="hover:underline underline-offset-4">Join an organisation</Link>
          </span>
        </div>
      </footer>
    </BrandScope>
  );
}

/** The score report, in miniature. Static on purpose: it is a picture, not a demo. */
function Specimen() {
  const rows: [string, string][] = [['Listening', '7.5'], ['Reading', '8.0'], ['Writing', '6.5']];
  return (
    <figure className="m-0">
      <div className="p-card p-[26px] bg-[color:var(--paper-raised)]">
        <div className="p-eyebrow mb-[18px]">Test report form</div>
        <div className="text-[13px] text-[color:var(--paper-ink-3)] mb-[3px]">Lê Thị B · VN-0043128</div>
        <div className="p-display text-[22px] mb-[20px]">IELTS Academic — practice test 1</div>
        <dl className="m-0">
          {rows.map(([skill, band]) => (
            <div key={skill} className="flex items-center justify-between py-[11px] border-t border-[color:var(--line)]">
              <dt className="text-[16px]">{skill}</dt>
              <dd className="m-0 text-[18px] font-semibold tabular-nums">{band}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between py-[13px] border-t border-[color:var(--line-strong)]">
            <dt className="text-[16px] font-semibold">Overall band score</dt>
            <dd className="m-0 p-display text-[28px] tabular-nums leading-none">7.5</dd>
          </div>
        </dl>
      </div>
      <figcaption className="text-[13px] text-[color:var(--paper-ink-3)] mt-[12px]">
        Issued once every skill has been sat and marked.
      </figcaption>
    </figure>
  );
}

function Figure({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex gap-[16px] items-baseline">
      <span className="p-display text-[40px] tabular-nums">{n}</span>
      <span className="text-[15px] leading-[1.5] text-[color:var(--paper-ink-2)] max-w-[30ch]">{label}</span>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold tabular-nums mb-[14px] text-[color:var(--paper-ink-3)]">{n}</div>
      <h3 className="text-[21px] font-semibold mb-[10px]">{title}</h3>
      <p className="text-[16px] leading-[1.68] text-[color:var(--paper-ink-2)]">{body}</p>
    </div>
  );
}
