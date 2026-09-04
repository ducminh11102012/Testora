import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { attempts, brandingOf, events, orgs, settingsOf, sittings } from '@/lib/db';
import ExamShell, { ExamSecurity } from '@/components/exam/ExamShell';
import { ExamContent, forCandidate } from '@/types/exam';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Examination in progress' };

export default async function TestPage({ params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const attempt = await attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) redirect('/dashboard');
  if (attempt.status !== 'in_progress') redirect(`/results/${attempt.id}`);

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const org = await orgs.byId(attempt.orgId);
  const sitting = attempt.sessionId ? await sittings.byId(attempt.sessionId) : null;

  // A sitting's own rules win; otherwise the organisation's defaults apply.
  const orgSettings = settingsOf(org);
  const sittingSettings = sitting ? JSON.parse(sitting.settings) : {};
  const security: ExamSecurity = {
    blockCopyPaste: sittingSettings.blockCopyPaste ?? orgSettings.blockCopyPaste,
    trackFocusLoss: sittingSettings.trackFocusLoss ?? orgSettings.trackFocusLoss,
    lockPartOnLeave: sittingSettings.lockPartOnLeave ?? orgSettings.lockPartOnLeave,
    releaseResultsImmediately: sittingSettings.releaseResultsImmediately ?? true,
    requireFullscreen: sittingSettings.requireFullscreen ?? false,
    blockRightClick: sittingSettings.blockRightClick ?? true,
    maxFocusLoss: Number(sittingSettings.maxFocusLoss ?? 0),
  };

  /*
   * A once-only recording that has been started stays started. The event trail
   * says when each one began, so a candidate who reloads the page gets the tape
   * where it would be by now rather than a fresh copy from the top.
   */
  const audioStartedAt: Record<string, string> = {};
  for (const event of await events.ofType(attempt.id, 'audio-start')) {
    let key = 'paper';
    try { key = String((JSON.parse(event.meta || '{}') as { key?: string }).key ?? 'paper'); } catch { /* keep the default */ }
    if (!audioStartedAt[key]) audioStartedAt[key] = new Date(event.at).toISOString();
  }

  // Whether this attempt has a clock was settled when it was created — the
  // duration can come from a suite item, a sitting or the paper, so re-deriving
  // it here would eventually disagree with the server and lose answers.
  const untimed = attempt.untimed === 1;

  return (
    <ExamShell
      // Stripped of the answer key: the exam screen is a client component, so
      // anything handed to it is readable in the browser.
      content={forCandidate(content)}
      branding={brandingOf(org)}
      security={security}
      untimed={untimed}
      audioStartedAt={audioStartedAt}
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
