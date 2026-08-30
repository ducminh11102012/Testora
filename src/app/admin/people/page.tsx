import { requireStaff } from '@/lib/context';
import { memberships, users } from '@/lib/db';
import PeopleManager from '@/components/admin/PeopleManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

export default async function PeoplePage() {
  const { org } = await requireStaff();
  const people = memberships.listOrg(org.id).map((m) => ({
    membershipId: m.membershipId,
    id: m.id,
    displayName: m.displayName,
    email: m.email,
    username: m.username,
    candidateRef: m.candidateRef,
    role: m.role,
    cohort: m.cohort,
    credits: m.credits,
    attempts: users.attemptCount(m.id),
  }));
  return <PeopleManager people={people} orgName={org.name} />;
}
