import { requireStaff } from '@/lib/context';
import { memberships, orgs, users } from '@/lib/db';
import PeopleManager from '@/components/admin/PeopleManager';
import JoinCodePanel from '@/components/admin/JoinCodePanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

export default async function PeoplePage() {
  const { org } = await requireStaff();
  const people = await Promise.all((await memberships.listOrg(org.id)).map(async (m) => ({
    membershipId: m.membershipId,
    id: m.id,
    displayName: m.displayName,
    email: m.email,
    username: m.username,
    candidateRef: m.candidateRef,
    role: m.role,
    cohort: m.cohort,
    credits: m.credits,
    attempts: await users.attemptCount(m.id),
  })));
  return (
    <>
      <JoinCodePanel code={await orgs.ensureJoinCode(org)} orgName={org.name} community={org.kind === 'community'} />
      <PeopleManager people={people} orgName={org.name} />
    </>
  );
}
