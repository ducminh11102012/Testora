import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { attempts, brandingOf, memberships, orgs, settingsOf, suites, tests, users } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill, Stat } from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import StartTestButton from '@/components/StartTestButton';
import NoPaperPanel from '@/components/NoPaperPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your tests' };

export default async function Dashboard() {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const account = await users.byId(user.id);
  const myOrgs = await memberships.of(user.id);
  const branding = brandingOf(await orgs.byId(user.orgId));

  // Papers released to the candidate: everything published in the schools they
  // belong to, plus anything free in the public catalogue.
  const orgTests = (await Promise.all(
    myOrgs.map(async (m) => (await tests.publishedOrg(m.orgId)).map((t) => ({ t, org: m }))),
  )).flat();
  const seen = new Set(orgTests.map((x) => x.t.id));
  const freeCatalogue = (await tests.catalogue()).filter((t) => !seen.has(t.id) && t.priceCredits === 0);

  const mySuites = (await Promise.all(
    myOrgs.map(async (m) => (await suites.publishedOrg(m.orgId, user.id)).map((s) => ({ s, org: m }))),
  )).flat();
  const seenSuites = new Set(mySuites.map((x) => x.s.id));
  const freeSuites = (await suites.catalogue()).filter((s) => !seenSuites.has(s.id) && s.priceCredits === 0);

  /*
   * Candidates get folders too. Papers reach them from several places at once —
   * each school they belong to, the public catalogue — and within a school they
   * arrive in groups: a book, a set of mocks. So the list is grouped by where a
   * paper came from and the folder it was filed under, rather than being one
   * long undifferentiated column.
   */
  const paperGroups = groupByFolder([
    ...orgTests.map(({ t, org }) => ({ item: t, owner: org.orgName, folder: t.folder })),
    ...freeCatalogue.map((t) => ({ item: t, owner: 'Public catalogue', folder: t.folder })),
  ]);
  const suiteGroups = groupByFolder([
    ...mySuites.map(({ s, org }) => ({ item: s, owner: org.orgName, folder: s.folder })),
    ...freeSuites.map((s) => ({ item: s, owner: 'Public catalogue', folder: s.folder })),
  ]);

  const history = await attempts.listForUser(user.id, 25);

  // What this candidate may do when nothing on the list appeals. Both are the
  // centre's decision: drawing a test from the bank costs nothing, having one
  // written spends the platform's AI budget.
  const orgSettings = await Promise.all(myOrgs.map(async (m) => settingsOf(await orgs.byId(m.orgId))));
  const platformOrg = await orgs.platform();
  const everySetting = [...orgSettings, settingsOf(platformOrg)];
  const canAssemble = everySetting.some((s) => s.allowCandidateAssembly);
  const canCompose = everySetting.some((s) => s.allowCandidateCompose);

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle={user.candidateRef ?? undefined}
        right={
          <>
            <span className="hidden sm:inline">
              <Pill tone="brand">{account?.credits ?? 0} credits</Pill>
            </span>
            <Link href="/catalogue" className="hover:underline">Catalogue</Link>
            <Link href="/join" className="hover:underline">Enter a code</Link>
            <LogoutButton />
          </>
        }
      />

      <main className="max-w-[1180px] mx-auto px-[28px] py-[44px]">
        <h1 className="text-[36px] font-normal mb-[10px]">Your tests</h1>
        <p className="text-[18px] text-[color:var(--paper-ink-2)] mb-[34px] max-w-[70ch]">
          Once you start a paper the timer runs continuously until you submit, even if you close the window.
        </p>

        {suiteGroups.length > 0 && (
          <>
            <h2 className="text-[15px] font-bold uppercase tracking-[0.1em] text-[color:var(--paper-ink-3)] mb-[12px]">
              Full tests
            </h2>
            {suiteGroups.map((group) => (
              <section key={`suites-${group.label}`} className="mb-[26px]">
                <FolderHeading label={group.label} count={group.items.length} />
                <ul className="list-none p-0 m-0 border-t border-[color:var(--line)]">
                  {group.items.map(({ item: s, owner }) => (
                    <li key={s.id} className="border-b border-[color:var(--line)]">
                      <div className="flex flex-wrap items-center gap-[18px] py-[20px]">
                        <div className="flex-1 min-w-[260px]">
                          <h3 className="text-[21px] font-semibold mb-[6px] leading-snug">{s.title}</h3>
                          <p className="text-[16px] text-[color:var(--paper-ink-3)]">
                            {owner} · {suites.itemsOf(s).map((i) => i.skill).join(' · ')}
                          </p>
                        </div>
                        <Link href={`/suite/${s.id}`} className="p-btn">Open test</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <h2 className="text-[15px] font-bold uppercase tracking-[0.1em] text-[color:var(--paper-ink-3)] mb-[12px]">
              Single papers
            </h2>
          </>
        )}

        {paperGroups.length === 0 ? (
          <div className="insp-notice">
            Nothing has been released to you yet. If your school gave you an exam code,{' '}
            <Link href="/join" className="p-link">enter it here</Link>.
          </div>
        ) : paperGroups.map((group) => (
          <section key={`papers-${group.label}`} className="mb-[26px]">
            <FolderHeading label={group.label} count={group.items.length} />
            <ul className="list-none p-0 m-0 border-t border-[color:var(--line)]">
              {group.items.map(({ item: t, owner }) => (
                <TestRow key={t.id} test={t} owner={owner} />
              ))}
            </ul>
          </section>
        ))}

        <NoPaperPanel canAssemble={canAssemble} canCompose={canCompose} />

        {history.length > 0 && (
          <>
            <h2 className="text-[26px] font-semibold mt-[52px] mb-[16px]">Your results</h2>
            <div className="grid gap-[10px] sm:grid-cols-3 mb-[22px]">
              <Stat label="Papers sat" value={history.filter((a) => a.status !== 'in_progress').length} />
              <Stat label="In progress" value={history.filter((a) => a.status === 'in_progress').length} />
              <Stat label="Awaiting marking" value={history.filter((a) => a.status === 'submitted' || a.status === 'marking').length} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[17px] border-collapse">
                <thead>
                  <tr className="text-left border-b border-[color:var(--line)]">
                    <th className="py-[10px] font-semibold">Paper</th>
                    <th className="py-[10px] font-semibold w-[170px]">Status</th>
                    <th className="py-[10px] font-semibold w-[110px]">Score</th>
                    <th className="py-[10px] font-semibold w-[90px]">Band</th>
                    <th className="py-[10px] w-[90px]" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id} className="border-b border-[color:var(--line)]">
                      <td className="py-[12px]">{a.testTitle}</td>
                      <td className="py-[12px] whitespace-nowrap">
                        {a.status === 'marked' ? <Pill tone="good">Marked</Pill>
                          : a.status === 'in_progress' ? <Pill tone="warn">In progress</Pill>
                            : <Pill>Awaiting marking</Pill>}
                      </td>
                      <td className="py-[12px] tabular-nums">
                        {a.rawScore === null ? '—' : a.rawScore + (a.manualScore ?? 0)}
                      </td>
                      <td className="py-[12px] font-semibold tabular-nums">{a.band ?? '—'}</td>
                      <td className="py-[12px] text-right">
                        {a.status === 'in_progress'
                          ? <Link href={`/test/${a.id}`} className="underline">Resume</Link>
                          : <Link href={`/results/${a.id}`} className="underline">View</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </BrandScope>
  );
}

/**
 * Groups anything with an owner and a folder into the sections a candidate
 * sees: the school it came from, and the folder inside it. A paper nobody filed
 * sits directly under its owner.
 */
function groupByFolder<T extends { id: string }>(
  entries: Array<{ item: T; owner: string; folder?: string | null }>,
): Array<{ label: string; items: Array<{ item: T; owner: string }> }> {
  const groups = new Map<string, Array<{ item: T; owner: string }>>();
  for (const entry of entries) {
    const folder = entry.folder?.trim();
    const label = folder ? `${entry.owner} · ${folder}` : entry.owner;
    groups.set(label, [...(groups.get(label) ?? []), { item: entry.item, owner: entry.owner }]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({ label, items }));
}

function FolderHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-[12px] mb-[2px]">
      <FolderIcon />
      <span className="text-[17px] font-semibold">{label}</span>
      <span className="text-[15px] text-[color:var(--paper-ink-3)]">
        {count} item{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/** A plain folder tab, drawn rather than imported, so the list reads as files. */
function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
    </svg>
  );
}

/** One row of the candidate's paper list: what it is on the left, the way in on the right. */
function TestRow({ test, owner }: {
  test: {
    id: string; title: string; module: string; durationMin: number; priceCredits: number;
    questionCount: number | null; hasAudio: number;
  };
  owner: string;
}) {
  return (
    <li className="border-b border-[color:var(--line)]">
      <div className="flex flex-wrap items-center gap-[18px] py-[20px]">
        <div className="flex-1 min-w-[260px]">
          <h3 className="text-[21px] font-semibold mb-[6px] leading-snug">{test.title}</h3>
          <p className="text-[16px] text-[color:var(--paper-ink-3)]">
            {owner} · {test.module}
            {test.durationMin > 0 ? ` · ${test.durationMin} minutes` : ' · no time limit'}
            {' · '}{test.questionCount ?? 0} questions
            {test.hasAudio === 1 ? ' · with a recording' : ''}
          </p>
        </div>
        <StartTestButton testId={test.id} priceCredits={test.priceCredits} />
      </div>
    </li>
  );
}
