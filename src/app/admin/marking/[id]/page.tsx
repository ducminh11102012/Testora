import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { attempts, markings, rubrics } from '@/lib/db';
import { ExamContent, FAMILY_OF } from '@/types/exam';
import { RubricCriterion } from '@/types/db';
import MarkingPanel from '@/components/admin/MarkingPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marking' };

/** IELTS-style default when a centre has not written its own rubric. */
const DEFAULT_CRITERIA: RubricCriterion[] = [
  { key: 'task', label: 'Task achievement', max: 9, descriptors: 'Covers the prompt fully and develops a position.' },
  { key: 'coherence', label: 'Coherence and cohesion', max: 9, descriptors: 'Logical progression; clear paragraphing and linking.' },
  { key: 'lexis', label: 'Lexical resource', max: 9, descriptors: 'Range and precision of vocabulary; collocation.' },
  { key: 'grammar', label: 'Grammatical range and accuracy', max: 9, descriptors: 'Variety of structures; control of error.' },
];

export default async function MarkAttempt({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const attempt = await attempts.byId(params.id);
  if (!attempt || (attempt.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const answers = JSON.parse(attempt.answers) as Record<string, unknown>;

  const tasks = content.parts.flatMap((p) =>
    p.groups.filter((g) => FAMILY_OF[g.type] === 'essay').flatMap((g) =>
      g.questions.map((q) => ({
        questionId: q.id,
        number: q.number,
        partTitle: p.title,
        prompt: g.instructions ?? '',
        minWords: q.minWords ?? 250,
        points: q.points ?? 1,
        response: typeof answers[q.id] === 'string' ? (answers[q.id] as string) : '',
      })),
    ));

  const saved = (await markings.forAttempt(attempt.id)).map((m) => ({
    questionId: m.questionId,
    scores: JSON.parse(m.scores) as Record<string, number>,
    comment: m.comment,
    awarded: m.awarded,
  }));

  const orgRubrics = await rubrics.listOrg(org.id);
  const criteria: RubricCriterion[] = orgRubrics.length
    ? JSON.parse(orgRubrics[0].criteria)
    : DEFAULT_CRITERIA;

  return (
    <MarkingPanel
      attemptId={attempt.id}
      candidate={attempt.candidateRef ?? attempt.candidateName}
      testTitle={attempt.testTitle}
      rubricId={orgRubrics[0]?.id ?? null}
      criteria={criteria}
      tasks={tasks}
      saved={saved}
      paperNotes={content.markingNotes ?? null}
    />
  );
}
