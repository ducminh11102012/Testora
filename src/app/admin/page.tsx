import Link from 'next/link';
import { requireStaff } from '@/lib/context';
import { attempts, imports, memberships, sittings, tests } from '@/lib/db';
import { configuredProvider } from '@/lib/parse';
import { Pill, Stat } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

export default async function AdminHome() {
  const { org, user } = await requireStaff();

  const papers = tests.count(org.id);
  const published = tests.count(org.id, 'published');
  const sittingRows = sittings.listOrg(org.id);
  const attemptRows = attempts.listOrg(org.id, 500);
  const waiting = attemptRows.filter((a) => a.status === 'submitted' || a.status === 'marking');
  const provider = configuredProvider();

  const live = attemptRows.filter((a) => a.status === 'in_progress' && new Date(a.endsAt).getTime() > Date.now());

  return (
    <div className="px-[34px] py-[34px] max-w-[1200px]">
      <div className="flex items-baseline justify-between gap-[16px] mb-[26px] flex-wrap">
        <div>
          <h1 className="text-[32px] font-semibold">{org.name}</h1>
          <p className="text-[16px] text-[#5e5e5e] mt-[4px]">
            {org.kind === 'platform' ? 'Public catalogue tenant' : 'Organisation workspace'} · /o/{org.slug}
          </p>
        </div>
        <Link href="/admin/import" className="px-[20px] h-[46px] leading-[46px] text-white rounded-[4px] text-[17px]"
              style={{ background: 'var(--brand)' }}>
          Import a paper
        </Link>
      </div>

      <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-5 mb-[30px]">
        <Stat label="Papers" value={papers} hint={`${published} published`} />
        <Stat label="Sittings" value={sittingRows.length} />
        <Stat label="Attempts" value={attemptRows.length} />
        <Stat label="Candidates" value={memberships.countOrg(org.id, 'candidate')} />
        <Stat label="Awaiting marking" value={waiting.length} />
      </div>

      {live.length > 0 && (
        <section className="border border-[#e3e3e3] rounded-[6px] p-[22px] mb-[20px]">
          <h2 className="text-[20px] font-semibold mb-[12px]">In progress right now</h2>
          <ul className="space-y-[8px]">
            {live.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-[16px] text-[16px]">
                <span>{a.candidateRef ?? a.candidateName} · {a.testTitle}</span>
                <span className="text-[#5e5e5e] tabular-nums">
                  ends {new Date(a.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-[16px] md:grid-cols-2">
        <section className="border border-[#e3e3e3] rounded-[6px] p-[22px]">
          <h2 className="text-[20px] font-semibold mb-[8px]">Paper importer</h2>
          <p className="text-[16px] text-[#3d3d3d] mb-[14px]">
            {provider === 'none'
              ? 'No AI provider is configured, so uploads are read by the rule-based engine alone. Add an API key to .env to switch the model pass on.'
              : `Hybrid parsing is on via ${provider}: the rule engine reads the structure and the answer key, then the model classifies each task.`}
          </p>
          <Link href="/admin/import" className="text-[16px] underline">Upload a Word or PDF paper</Link>
        </section>

        <section className="border border-[#e3e3e3] rounded-[6px] p-[22px]">
          <h2 className="text-[20px] font-semibold mb-[8px]">Marking queue</h2>
          <p className="text-[16px] text-[#3d3d3d] mb-[14px]">
            {waiting.length === 0
              ? 'Nothing is waiting. Writing tasks appear here the moment a candidate submits.'
              : `${waiting.length} paper${waiting.length === 1 ? '' : 's'} with writing tasks need a marker.`}
          </p>
          <Link href="/admin/marking" className="text-[16px] underline">Open the marking queue</Link>
        </section>
      </div>

      {imports.count(org.id) === 0 && papers === 0 && (
        <div className="mt-[20px] border rounded-[6px] px-[22px] py-[18px] text-[17px]"
             style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
          This workspace is empty. Start by importing a paper, or create one by hand under{' '}
          <Link href="/admin/tests" className="underline">Papers</Link>.
        </div>
      )}

      <p className="mt-[26px] text-[15px] text-[#8a8a8a]">
        Signed in as {user.displayName} ({user.role}).
      </p>
    </div>
  );
}
