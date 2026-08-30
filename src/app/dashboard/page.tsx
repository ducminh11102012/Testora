import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { attempts, brandingOf, memberships, orgs, tests, users } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill, Stat } from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import StartTestButton from '@/components/StartTestButton';
import { ExamContent, totalQuestions } from '@/types/exam';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your tests' };

export default async function Dashboard() {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const account = users.byId(user.id);
  const myOrgs = memberships.of(user.id);
  const branding = brandingOf(orgs.byId(user.orgId));

  // Papers released to the candidate: everything published in the schools they
  // belong to, plus anything free in the public catalogue.
  const orgTests = myOrgs.flatMap((m) => tests.publishedOrg(m.orgId).map((t) => ({ t, org: m })));
  const seen = new Set(orgTests.map((x) => x.t.id));
  const freeCatalogue = tests.catalogue().filter((t) => !seen.has(t.id) && t.priceCredits === 0);

  const history = attempts.listForUser(user.id, 25);

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
        <h1 className="text-[34px] font-semibold mb-[8px]">Your tests</h1>
        <p className="text-[18px] text-[#5e5e5e] mb-[34px]">
          Once you start a paper the timer runs continuously until you submit, even if you close the window.
        </p>

        {orgTests.length + freeCatalogue.length === 0 ? (
          <div className="border rounded-[6px] px-[22px] py-[18px] text-[18px]"
               style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
            Nothing has been released to you yet. If your school gave you an exam code,{' '}
            <Link href="/join" className="underline">enter it here</Link>.
          </div>
        ) : (
          <div className="grid gap-[16px] md:grid-cols-2">
            {orgTests.map(({ t, org }) => <TestCard key={t.id} test={t} owner={org.orgName} />)}
            {freeCatalogue.map((t) => <TestCard key={t.id} test={t} owner="Public catalogue" />)}
          </div>
        )}

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
                  <tr className="text-left border-b border-[#dcdcdc]">
                    <th className="py-[10px] font-semibold">Paper</th>
                    <th className="py-[10px] font-semibold w-[150px]">Status</th>
                    <th className="py-[10px] font-semibold w-[110px]">Score</th>
                    <th className="py-[10px] font-semibold w-[90px]">Band</th>
                    <th className="py-[10px] w-[90px]" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id} className="border-b border-[#efefef]">
                      <td className="py-[12px]">{a.testTitle}</td>
                      <td className="py-[12px]">
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

function TestCard({ test, owner }: { test: { id: string; title: string; module: string; durationMin: number; content: string; priceCredits: number }; owner: string }) {
  const content = JSON.parse(test.content) as ExamContent;
  return (
    <div className="border border-[#dcdcdc] rounded-[6px] p-[22px]">
      <div className="flex items-center gap-[10px] mb-[10px] flex-wrap">
        <Pill tone="brand">{test.module}</Pill>
        <span className="text-[15px] text-[#5e5e5e]">{test.durationMin} minutes</span>
        <span className="text-[15px] text-[#5e5e5e]">· {totalQuestions(content)} questions</span>
      </div>
      <h2 className="text-[21px] font-semibold mb-[6px] leading-snug">{test.title}</h2>
      <p className="text-[15px] text-[#5e5e5e] mb-[18px]">{owner}</p>
      <StartTestButton testId={test.id} priceCredits={test.priceCredits} />
    </div>
  );
}
