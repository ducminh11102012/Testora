import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { attempts, brandingOf, orgs, settingsOf, sittings } from '@/lib/db';
import ExamShell, { ExamSecurity } from '@/components/exam/ExamShell';
import { ExamContent } from '@/types/exam';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Examination in progress' };

export default async function TestPage({ params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const attempt = attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) redirect('/dashboard');
  if (attempt.status !== 'in_progress') redirect(`/results/${attempt.id}`);

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const org = orgs.byId(attempt.orgId);
  const sitting = attempt.sessionId ? sittings.byId(attempt.sessionId) : null;

  // A sitting's own rules win; otherwise the organisation's defaults apply.
  const orgSettings = settingsOf(org);
  const sittingSettings = sitting ? JSON.parse(sitting.settings) : {};
  const security: ExamSecurity = {
    blockCopyPaste: sittingSettings.blockCopyPaste ?? orgSettings.blockCopyPaste,
    trackFocusLoss: sittingSettings.trackFocusLoss ?? orgSettings.trackFocusLoss,
    lockPartOnLeave: sittingSettings.lockPartOnLeave ?? orgSettings.lockPartOnLeave,
    releaseResultsImmediately: sittingSettings.releaseResultsImmediately ?? true,
  };

  return (
    <ExamShell
      content={content}
      branding={brandingOf(org)}
      security={security}
      attempt={{
        id: attempt.id,
        testTakerId: user.candidateRef ?? user.displayName,
        startedAt: new Date(attempt.startedAt).toISOString(),
        endsAt: new Date(attempt.endsAt).toISOString(),
        answers: JSON.parse(attempt.answers),
        annotations: JSON.parse(attempt.annotations || '[]'),
        flags: JSON.parse(attempt.flags || '[]'),
      }}
    />
  );
}
