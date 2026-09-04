/**
 * The checks that need no server, no database and no model.
 *
 * Everything here is a pure function this platform's correctness rests on:
 * how an answer is compared, how marks are shared out, how a book is cut into
 * papers, which recording a part plays, what a candidate's copy of a paper is
 * allowed to contain, and what the sanitiser lets through. They run in about a
 * second, so they can run on every change.
 */

import { readFileSync } from 'node:fs';

import { check, equal, near, report, suite } from './harness';
import {
  ExamContent, Group, Part, Question, audioFor, forCandidate, isListeningPart, missingAudio,
  renumber, reportedTotal, scaleToTotal, scoringOf, totalPoints, totalQuestions,
} from '../../src/types/exam';
import { expand, grade, isCorrect, normalise } from '../../src/lib/grading';
import { normaliseContent } from '../../src/lib/parse/normalize';
import { extractFile } from '../../src/lib/parse/extract';
import {
  BookSegment, findKeyRegion, segmentBook, shareOutKey, splitAnswerKey,
} from '../../src/lib/parse/book';
import { typeFolder } from '../../src/lib/parse/shelve';
import { parseAnswerKey, parseMarkingNotes, parseWithRules } from '../../src/lib/parse/rules';
import { splitPaper } from '../../src/lib/parse/split';
import { LOOSE, onShelf, shelve } from '../../src/lib/folders';
import { parseModelJson } from '../../src/lib/ai/json';
import { sanitizeBlock, sanitizeInline } from '../../src/lib/sanitize';
import { preflight } from '../../src/lib/preflight';
import { explanationCoverage } from '../../src/lib/ai/explain';
import { troubleWith } from '../../src/lib/storage/vault';

/* --------------------------------- helpers ------------------------------- */

function question(number: number, extra: Partial<Question> = {}): Question {
  return { id: `q${number}`, number, prompt: `Question ${number}`, answers: ['one'], ...extra };
}

function group(type: Group['type'], questions: Question[], extra: Partial<Group> = {}): Group {
  return { id: `g-${type}-${questions[0]?.number ?? 0}`, type, questions, ...extra };
}

function part(title: string, groups: Group[], extra: Partial<Part> = {}): Part {
  return { id: `p-${title}`, title, instructions: '', groups, ...extra };
}

function paper(parts: Part[], extra: Partial<ExamContent> = {}): ExamContent {
  return { title: 'A paper', module: 'reading', durationMinutes: 60, parts, ...extra };
}

/* ------------------------------ answer marking --------------------------- */

suite('Marking one answer');

equal('case and spacing are ignored', normalise('  The   LIBRARY '), 'library');
equal('a leading article is ignored', normalise('a library'), normalise('library'));
check('a slash offers alternatives', ['color', 'colour'].every((v) => expand(['colour/color']).includes(v)));
check('the printed form is still accepted', expand(['colour/color']).includes('colour/color'));
check('a pipe offers alternatives', expand(['1908|nineteen oh eight']).length >= 2);

check('the right answer is marked right', isCorrect(question(1, { answers: ['1908'] }), '1908'));
check('a stray space does not fail a candidate', isCorrect(question(1, { answers: ['1908'] }), ' 1908 '));
check('the wrong answer is marked wrong', !isCorrect(question(1, { answers: ['1908'] }), '1909'));
check('nothing written is not correct', !isCorrect(question(1, { answers: ['1908'] }), null));
check('an empty string is not correct', !isCorrect(question(1, { answers: ['1908'] }), '   '));
check('NOT GIVEN matches its printed form', isCorrect(question(1, { answers: ['NOT GIVEN'] }), 'not given'));
check(
  'a multiple-answer question needs every part',
  isCorrect(question(1, { answers: ['A', 'C'], selectCount: 2 }), ['C', 'A'])
    && !isCorrect(question(1, { answers: ['A', 'C'], selectCount: 2 }), ['A']),
);

/* --------------------------------- grading ------------------------------- */

suite('Grading a paper');

const marked = grade(
  paper([part('Part 1', [group('multiple-choice', [
    question(1, { answers: ['A'] }),
    question(2, { answers: ['B'] }),
    question(3, { answers: ['C'] }),
  ])])]),
  { q1: 'A', q2: 'wrong', q3: 'C' },
);
equal('two of three right', marked.raw, 2);
equal('the total is the number of questions', marked.possible, 3);
check('the wrong one is reported as wrong', marked.perQuestion.find((r) => r.number === 2)?.correct === false);
check('nothing is waiting on a marker', !marked.requiresManualMarking);

const withEssay = grade(
  paper([
    part('Part 1', [group('multiple-choice', [question(1, { answers: ['A'] })])]),
    part('Part 2', [group('writing-task', [question(2, { answers: [], points: 9, minWords: 250 })])]),
  ]),
  { q1: 'A', q2: 'Some writing.' },
);
check('an essay waits for a marker', withEssay.requiresManualMarking);
equal('the essay is not marked by the key', withEssay.perQuestion.find((r) => r.number === 2)?.manual, true);
equal('the objective mark is still counted', withEssay.raw, 1);

const blank = grade(paper([part('Part 1', [group('multiple-choice', [question(1, { answers: ['A'] })])])]), {});
equal('a paper nobody answered scores nothing', blank.raw, 0);

/* --------------------------- marks and reporting ------------------------- */

suite('Marks and how they are reported');

const school = paper([part('Phần I', [group('multiple-choice', [
  question(1, { points: 0.5 }), question(2, { points: 0.5 }),
])])], { scoring: 'points', totalPoints: 20, variant: 'school' });
equal('a school paper is marked in points', scoringOf(school), 'points');
equal('the printed total is what it is out of', reportedTotal(school), 20);
near('marks scale onto the printed total', scaleToTotal(school, 0.5), 10);

const ielts = paper([part('Part 1', [group('multiple-choice', [question(1)])])], {
  title: 'IELTS Academic Reading', variant: 'academic', module: 'reading',
});
equal('an IELTS paper is banded', scoringOf(ielts), 'band');

equal('marks default to one a question', totalPoints(paper([part('P', [group('short-answer', [question(1), question(2)])])])), 2);
equal('questions are counted across parts', totalQuestions(paper([
  part('One', [group('short-answer', [question(1)])]),
  part('Two', [group('short-answer', [question(2), question(3)])]),
])), 3);

/* ------------------------- normalising a parsed paper -------------------- */

suite('Normalising what the model returned');

const shared = normaliseContent({
  title: 'Section totals',
  module: 'reading',
  durationMinutes: 0,
  parts: [{
    title: 'PHẦN II',
    points: 4,
    groups: [{
      type: 'multiple-choice',
      questions: Array.from({ length: 8 }, (_, i) => ({
        number: i + 1, prompt: `Q${i + 1}`,
        options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }],
        answers: ['A'],
      })),
    }],
  }],
}).content;
near("a section's marks are shared out", totalPoints(shared), 4, 0.001);
check('every question in it carries a mark', shared.parts[0].groups[0].questions.every((q) => (q.points ?? 0) > 0));

const repaired = normaliseContent({
  title: 'Missing options',
  module: 'reading',
  durationMinutes: 60,
  parts: [{
    title: 'Part 1',
    groups: [{
      type: 'true-false-notgiven',
      questions: [{ number: 1, prompt: 'A statement.', answers: ['TRUE'] }],
    }],
  }],
}).content;
check(
  'a true/false question gets its three options',
  (repaired.parts[0].groups[0].questions[0].options ?? []).length === 3,
);

const renumbered = renumber(paper([
  part('One', [group('summary-completion', [question(5), question(6)], { bodyHtml: '<p>a [[5]] b [[6]]</p>' })]),
]));
equal('gap markers follow the renumbering', renumbered.parts[0].groups[0].bodyHtml, '<p>a [[1]] b [[2]]</p>');

/* ------------------------------- a whole book ---------------------------- */

suite('Cutting a book into papers');

const bookText = [
  'CONTENTS', 'TEST 1 ... 5', 'TEST 2 ... 20', '',
  'TEST 1', 'x'.repeat(2000), 'Questions 1-3', '1. First?', '',
  'TEST 2', 'y'.repeat(2000), 'Questions 1-3', '1. First?', '',
  'ANSWER KEY', 'TEST 1', '1 A  2 B', '', 'TEST 2', '1 C  2 D', '',
].join('\n');
const segments = segmentBook(bookText);
equal('two papers come out of it', segments.length, 2);
equal('they are numbered as printed', segments.map((s) => s.number), [1, 2]);
check('the contents page is not a paper', segments.every((s) => s.text.length > 1500));
check('each paper carries its own key',
  /1 A/.test(segments[0].keyText ?? '') && /1 C/.test(segments[1].keyText ?? ''));
equal('one paper stays one paper', segmentBook('Just one paper.\n1. A question?').length, 1);

const keyBlocks = splitAnswerKey('TEST 1\n1 A\n2 B\nTEST 2\n1 C\n2 D');
equal('a separate key file splits by test', keyBlocks.size, 2);
check('the right block goes to the right test', /1 C/.test(keyBlocks.get(2) ?? ''));

/* ------------------------- a key that came separately -------------------- */

suite('Reading a separate answer key');

const printed = parseAnswerKey('1. A\n2. B\n3. C', { whole: true });
equal('a plain list is read without a heading', [printed[1], printed[2], printed[3]], [['A'], ['B'], ['C']]);
equal('and nothing is invented from prose', Object.keys(parseAnswerKey('Some prose about answers.', {})).length, 0);

const notes = parseMarkingNotes([
  'ĐÁP ÁN', '1. A', '2. B', '',
  'PHẦN II. HƯỚNG DẪN CHẤM PHẦN VIẾT (2,0 điểm)',
  '- Nội dung: 1,0 điểm. Nêu rõ quan điểm.',
  '- Ngôn ngữ: 0,75 điểm.',
].join('\n'));
check('the rubric in the key is picked up', !!notes && /Nội dung/.test(notes));
check('a key with no rubric yields none', parseMarkingNotes('1. A\n2. B') === undefined);

/* ------------------------------- recordings ------------------------------ */

suite('Which recording a part plays');

const threeParts = paper([
  part('Part 1', [group('short-answer', [question(1)])], { listening: true }),
  part('Part 2', [group('short-answer', [question(2)])], { listening: true }),
  part('Part 3', [group('short-answer', [question(3)])], { listening: true }),
], { module: 'listening' });

equal('no recording anywhere means nothing to play', audioFor(threeParts, threeParts.parts[0]), null);
equal('every listening part is reported as silent', missingAudio(threeParts).length, 3);

const oneTape = { ...threeParts, audioUrl: '/tape.mp3' };
equal('one tape covers part 1', audioFor(oneTape, oneTape.parts[0])?.scope, 'paper');
equal('one tape covers part 3 as well', audioFor(oneTape, oneTape.parts[2])?.scope, 'paper');
equal('nothing is missing once the paper has a tape', missingAudio(oneTape).length, 0);

const perPart = {
  ...threeParts,
  audioUrl: '/tape.mp3',
  parts: threeParts.parts.map((p, i) => (i === 1 ? { ...p, audioUrl: '/part-2.mp3' } : p)),
};
equal("a part's own file wins for that part", audioFor(perPart, perPart.parts[1])?.src, '/part-2.mp3');
equal('the paper tape still covers the others', audioFor(perPart, perPart.parts[0])?.src, '/tape.mp3');

const mixed = paper([
  part('Part 1', [group('short-answer', [question(1)])], { listening: true }),
  part('Part 2', [group('short-answer', [question(2)])]),
], { module: 'mixed', audioUrl: '/tape.mp3' });
const split = splitPaper(mixed);
check('a mixed paper splits in two', split.split && split.papers.length === 2);
const listeningHalf = split.papers.find((p) => p.skill === 'listening');
const writtenHalf = split.papers.find((p) => p.skill !== 'listening');
equal('the tape goes with the listening half', listeningHalf?.content.audioUrl, '/tape.mp3');
equal('and not with the written half', writtenHalf?.content.audioUrl, undefined);
check('a listening part is recognised by its words', isListeningPart(part('Part 1', [], { instructions: 'You will hear a recording.' })));

/* ----------------------- the candidate's copy of a paper ----------------- */

suite("What a candidate's copy may contain");

const withKey = paper([part('Part 1', [group('multiple-choice', [
  question(1, { answers: ['A'], markingNote: 'Answer supplied by AI — please check.' }),
  question(2, { answers: ['B'], fields: [{ key: 'mistake', answers: ['were'] }] }),
])])], { markingNotes: 'Nội dung 2,0đ · Ngôn ngữ 1,5đ' });
const candidateCopy = forCandidate(withKey);
const asSent = JSON.stringify(candidateCopy);

check('no answer survives', !/"answers":\[".+?"\]/.test(asSent));
check("no marker's note survives", !asSent.includes('supplied by AI'));
check('the rubric does not survive', !asSent.includes('Nội dung'));
check('no field answer survives', !asSent.includes('were'));
check('the questions themselves are still there', totalQuestions(candidateCopy) === 2);
check('the original is untouched', withKey.parts[0].groups[0].questions[0].answers[0] === 'A');

/* ------------------------- explanations, and who sees them --------------- */

suite('Answer explanations');

const explained = paper([part('Part 1', [group('multiple-choice', [
  question(1, { answers: ['A'], explanation: 'A is right because the passage says so in line two.' }),
  question(2, { answers: ['B'] }),
])])]);
const coverage = explanationCoverage(explained);
equal('coverage counts what could be explained', coverage.possible, 2);
equal('and what is', coverage.written, 1);
equal('an essay is not counted', explanationCoverage(paper([
  part('Part 1', [group('writing-task', [question(1, { answers: [], points: 9 })])]),
])).possible, 0);

const strippedCopy = JSON.stringify(forCandidate(explained));
check('an explanation never reaches the exam screen', !strippedCopy.includes('because the passage'));
check('but stays on the paper itself', !!explained.parts[0].groups[0].questions[0].explanation);

/* ------------------------- a model reply that was cut ------------------- */

suite('Repairing a reply the model cut short');

const whole = JSON.stringify({
  title: 'Long', module: 'reading', durationMinutes: 0,
  parts: [{ title: 'Part 1', groups: [{ type: 'multiple-choice', questions: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, prompt: `Q${i + 1}`, answers: ['A'] })) }] }],
});
let unreadable = 0;
let kept = 0;
for (let cut = Math.floor(whole.length * 0.3); cut < whole.length; cut += 7) {
  try {
    const value = parseModelJson(whole.slice(0, cut)).value as { parts?: unknown[] };
    if (Array.isArray(value.parts)) kept += 1;
  } catch {
    unreadable += 1;
  }
}
equal('no cut leaves an unreadable reply', unreadable, 0);
check('most cuts still yield the paper', kept > 0);
check('a complete reply is read as it is', (parseModelJson(whole).value as { title: string }).title === 'Long');
check('a fenced reply is read too', (parseModelJson(`\`\`\`json\n${whole}\n\`\`\``).value as { title: string }).title === 'Long');

/* -------------------------------- sanitising ----------------------------- */

suite('Sanitising what a parsed paper prints');

const nasty = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  "<img src=x onerror=alert(1) alt='>",
  '<a href="javascript:alert(1)">click</a>',
  '<div onclick="alert(1)">text</div>',
  '<style>body{display:none}</style>',
  '<iframe src="https://evil.example"></iframe>',
  '<svg><use href="#x"/></svg>',
  '<math><mtext>x</mtext></math>',
];
for (const html of nasty) {
  const cleaned = sanitizeBlock(html);
  check(
    `nothing executable survives: ${html.slice(0, 32)}`,
    !/<script|onerror|onclick|javascript:|<iframe|<style|<svg|<math/i.test(cleaned),
    cleaned,
  );
}
check('the formatting a paper needs survives', sanitizeBlock('<p>The <u>underlined</u> <b>word</b>.</p>')
  === '<p>The <u>underlined</u> <b>word</b>.</p>');
check('a table survives', /<table/.test(sanitizeBlock('<table><tr><td>1</td></tr></table>')));
check('inline sanitising drops block tags', !/<p>/.test(sanitizeInline('<p>text</p>')));

/* --------------------------- pre-flight over a paper --------------------- */

suite('Pre-flight over a paper');

const clean = preflight(paper([part('Part 1', [group('multiple-choice', [
  question(1, { answers: ['A'], options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }] }),
])])]));
check('a sound paper passes', clean.blocking.length === 0, JSON.stringify(clean.blocking));

const duplicates = preflight(paper([part('Part 1', [group('short-answer', [question(1), question(1)])])]));
check('duplicate question numbers are caught', duplicates.blocking.some((p) => p.code === 'duplicate-numbers'));

const orphanGap = preflight(paper([part('Part 1', [
  group('summary-completion', [question(1)], { bodyHtml: '<p>a [[1]] b [[9]]</p>' }),
])]));
check('a gap with no question is caught', orphanGap.blocking.some((p) => p.code === 'orphan-gap'));

const noAnswer = preflight(paper([part('Part 1', [
  group('short-answer', [question(1, { answers: [] })]),
])]));
check('a question with no answer is caught', noAnswer.blocking.some((p) => p.code === 'no-answer'));

const thinOptions = preflight(paper([part('Part 1', [
  group('multiple-choice', [question(1, { answers: ['A'], options: [{ label: 'A', text: 'one' }] })]),
])]));
check('a single-option question is caught', thinOptions.blocking.some((p) => p.code === 'thin-options'));

const silent = preflight(threeParts);
check('a silent listening paper is caught', silent.blocking.some((p) => p.code === 'no-recording'));
check('the same paper with a tape is not', preflight(oneTape).blocking.every((p) => p.code !== 'no-recording'));

const wrongTotal = preflight(paper([part('Part 1', [group('multiple-choice', [
  question(1, { answers: ['A'], points: 1, options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] }),
])])], { scoring: 'points', totalPoints: 20 }));
check('marks that do not add up are reported', wrongTotal.advisory.some((p) => p.code === 'marks-mismatch'));

const emptyPaper = preflight(paper([]));
check('a paper with no questions cannot go live', emptyPaper.blocking.some((p) => p.code === 'empty'));



/* ------------- the storage console must open when storage is down -------- */

suite('An unreachable store is an answer, not a 500');

const refused = Object.assign(new Error('fetch failed'), {
  cause: { code: 'ECONNREFUSED' },
});
check('a store that does not answer is named as such',
  /did not answer/.test(troubleWith(refused)));
check('rotated credentials are named as such',
  /refused the credentials/.test(troubleWith(new Error('403 Forbidden: invalid token'))));
check('nothing configured yet is not reported as a fault',
  troubleWith(new Error('No storage is configured yet.')) === 'No storage is configured yet.');
check('anything else still carries the reason',
  troubleWith(new Error('the disk is on fire')).includes('the disk is on fire'));
check('the console reads the store through the soft path',
  ['src/app/platform/storage/page.tsx', 'src/app/admin/storage/page.tsx']
    .every((f) => {
      const text = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      return text.includes('bucketsSoft') && !/\breadVault\(|\borgBuckets\(|\bplatformBuckets\(/.test(text);
    }));

/* ---------------- a book is cut into papers, not into one -------------- */

suite('Cutting a book up');

const drill = Array.from({ length: 12 }, () =>
  'PART 5: INCOMPLETE SENTENCES\nDirections: choose the best answer.\n'
  + Array.from({ length: 10 }, (_, i) =>
    `${i + 1}. The manager ______ the report before the meeting.\nA. review B. reviews C. reviewed D. reviewing`).join('\n')).join('\n\n');
const cutDrill = segmentBook(drill);
equal('a drill book of "Part 5" over and over is one paper each', cutDrill.length, 12);
check('and it says it cut on the exercise headings', cutDrill[0].by === 'exercise');
check('the repeats are told apart by name', cutDrill[1].title !== cutDrill[0].title);

const oneListening = ['PART 1', 'PART 2', 'PART 3', 'PART 4'].map((t, i) =>
  `${t}\nQuestions ${i * 10 + 1}-${i * 10 + 10}\n`
  + Array.from({ length: 10 }, (_, k) => `${i * 10 + k + 1}. Write NO MORE THAN TWO WORDS ______`).join('\n')).join('\n\n');
equal('the four parts of one listening paper stay one paper', segmentBook(oneListening).length, 1);

const toeic = Array.from({ length: 7 }, (_, i) =>
  `PART ${i + 1}\nDirections.\n`
  + Array.from({ length: 10 }, (_, k) => `${i * 10 + k + 1}. Question text goes here, long enough to matter.`).join('\n')).join('\n\n');
equal('one seven-part test is not seven papers', segmentBook(toeic).length, 1);
equal('but it is when the operator says it is a book', segmentBook(toeic, { force: true }).length, 7);

const bai = Array.from({ length: 8 }, (_, i) =>
  `Bài ${i + 1}. Chia dạng đúng của động từ\n`
  + Array.from({ length: 10 }, (_, k) => `${k + 1}. He (go) ______ to school.`).join('\n')).join('\n\n');
equal('"Bài 1 … Bài 8" is eight papers', segmentBook(bai).length, 8);

const cambridge = [1, 2, 3, 4].map((n) =>
  `TEST ${n}\n${Array.from({ length: 4 }, (_, i) => `PART ${i + 1}\n${'Question text. '.repeat(60)}`).join('\n\n')}`).join('\n\n');
const cut = segmentBook(cambridge);
equal('a book of whole tests is cut on the tests', cut.length, 4);
check('and the test headings win over the parts inside them', cut[0].by === 'test');

const restarts = Array.from({ length: 6 }, () =>
  Array.from({ length: 12 }, (_, k) =>
    `${k + 1}. Question text here that is reasonably long so the piece has some size to it.`).join('\n')).join('\n\n');
const cutRestart = segmentBook(restarts);
equal('numbering that starts over is a boundary too', cutRestart.length, 6);
check('and it says so', cutRestart[0].by === 'restart');

const shapeless = 'Đây là một đoạn văn dài. '.repeat(1200);
equal('shapeless text is left alone', segmentBook(shapeless).length, 1);
check('until the operator insists it is a book', segmentBook(shapeless, { force: true }).length > 1);
check('and then it says the cut was by length',
  segmentBook(shapeless, { force: true })[0].by === 'chunk');

/* ------------------- and filed by what it turns out to be -------------- */

suite('Filing a mixed book by type');

const mcq = paper([part('Part 1', [group('multiple-choice', Array.from({ length: 10 }, (_, i) =>
  question(i + 1, { answers: ['A'], options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] })))])],
{ module: 'reading' });
equal('a reading paper of multiple choice files itself', typeFolder(mcq), 'Reading — Multiple choice');

const essay = paper([part('Task 2', [group('writing-task', [question(1, { answers: [] })])])], { module: 'writing' });
equal('a writing paper is filed by its skill alone', typeFolder(essay), 'Writing');

const halfAndHalf = paper([part('Part 1', [
  group('multiple-choice', Array.from({ length: 5 }, (_, i) =>
    question(i + 1, { answers: ['A'], options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] }))),
  group('short-answer', Array.from({ length: 5 }, (_, i) => question(i + 6))),
])], { module: 'reading' });
equal('a paper of no one type is filed as mixed', typeFolder(halfAndHalf), 'Reading — Mixed');

/* -------------- a practice run leaves the candidate something ---------- */

suite('Practice hands back a result');

check('the exam page sends practice to its own result, not back to the hub',
  readFileSync(new URL('../../src/app/api/attempts/[id]/submit/route.ts', import.meta.url), 'utf8')
    .includes('suiteId: practice ? null : suite?.id'));
check('and the result page does not withhold a practice score',
  readFileSync(new URL('../../src/app/results/[id]/page.tsx', import.meta.url), 'utf8')
    .includes('isOwner && !practice && !release'));

/* ------------- the commonest multiple-choice layout there is ----------- */

suite('Options printed on their own line');

const underneath = parseWithRules(
  `PART 5\nDirections: choose the best answer.\n${
    Array.from({ length: 5 }, (_, i) =>
      `${i + 1}. The manager ______ the report.\nA. review   B. reviews   C. reviewed   D. reviewing`).join('\n')}`,
  {},
);
const firstGroup = underneath.content.parts.flatMap((p) => p.groups)[0];
equal('the stem on one line and the options under it is multiple choice',
  firstGroup.type, 'multiple-choice');
equal('and all four options are read, not one holding the other three',
  firstGroup.questions[0].options?.length ?? 0, 4);
equal('the second option is its own text', firstGroup.questions[0].options?.[1].text, 'reviews');

const stacked = parseWithRules('PART 1\nQ.\n1. Choose one.\nA. first option\nB. second option\nC. third option\n', {});
equal('one option per line still reads as three',
  stacked.content.parts[0].groups[0].questions[0].options?.length ?? 0, 3);

const runOn = parseWithRules('PART 1\nQ.\n1. Choose one. A. first B. second C. third D. fourth\n', {});
equal('and options run together after the stem still read as four',
  runOn.content.parts[0].groups[0].questions[0].options?.length ?? 0, 4);

/* --------------- the answers printed at the back of the book ----------- */

suite('The key at the back reaches its paper');

const fourDrills = Array.from({ length: 4 }, (_, n) =>
  `PART 5: INCOMPLETE SENTENCES\nDirections.\n${
    Array.from({ length: 10 }, (_, i) =>
      `${i + 1}. The manager ______ the report ${n}-${i}.\nA. review   B. reviews   C. reviewed   D. reviewing`).join('\n')}`).join('\n\n');

const runKey = `ANSWER KEY\n${Array.from({ length: 4 }, () =>
  Array.from({ length: 10 }, (_, i) => `${i + 1}. ${'ABCD'[i % 4]}`).join('  ')).join('\n\n')}`;
const withRunKey = segmentBook(`${fourDrills}\n\n${runKey}`);
check('a key that starts again at 1 for each exercise is shared out',
  withRunKey.length === 4 && withRunKey.every((s) => !!s.keyText));

const headedKey = `ĐÁP ÁN\n${Array.from({ length: 4 }, (_, k) =>
  `PART 5 (${k + 1})\n${Array.from({ length: 10 }, (_, i) => `${i + 1}. ${'ABCD'[i % 4]}`).join('  ')}`).join('\n\n')}`;
check('a key that repeats the headings is shared out too',
  segmentBook(`${fourDrills}\n\n${headedKey}`).every((s) => !!s.keyText));

const straight = Array.from({ length: 4 }, (_, k) =>
  `Bài ${k + 1}. Chọn đáp án đúng\n${Array.from({ length: 10 }, (_, i) =>
    `${k * 10 + i + 1}. The manager ______ the report.\nA. review   B. reviews   C. reviewed   D. reviewing`).join('\n')}`).join('\n\n');
const straightKey = `ĐÁP ÁN\n${Array.from({ length: 40 }, (_, i) => `${i + 1}. ${'ABCD'[i % 4]}`).join('  ')}`;
check('numbering that runs straight through the book is matched by number',
  segmentBook(`${straight}\n\n${straightKey}`).every((s) => !!s.keyText));

const testBook = [1, 2, 3].map((n) =>
  `TEST ${n}\n${'Question text. '.repeat(120)}\n${
    Array.from({ length: 5 }, (_, i) => `${i + 1}. Something ______`).join('\n')}`).join('\n\n');
const testKey = `ANSWER KEY\n${[1, 2, 3].map((n) =>
  `TEST ${n}\n${Array.from({ length: 5 }, (_, i) => `${i + 1}. ${'ABCDE'[i]}`).join('  ')}`).join('\n\n')}`;
const cutTests = segmentBook(`${testBook}\n\n${testKey}`);
check('a book of whole tests still gets its key by test',
  cutTests.length === 3 && (cutTests[1].keyText ?? '').startsWith('TEST 2'));

check('and a book with no key printed is given no key',
  segmentBook(fourDrills).every((s) => !s.keyText));

/* --------------- keeping a paper whole, and the shelves ---------------- */

suite('A paper that must not be cut up');

const mixedPaper = paper([
  part('Section A — Listening', [group('note-completion', [question(1)])], { listening: true }),
  part('Section B — Reading', [group('multiple-choice', [
    question(2, { answers: ['A'], options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] })])]),
  part('Section C — Writing', [group('writing-task', [question(3, { answers: [] })])]),
], { module: 'mixed' });

const cutUp = splitPaper(mixedPaper);
check('by default a listening section is sat as its own paper', cutUp.papers.length > 1);

const keptWhole = splitPaper(mixedPaper, { whole: true });
equal('"keep it whole" leaves exactly one paper', keptWhole.papers.length, 1);
equal('and it still has every part', keptWhole.papers[0].content.parts.length, 3);
check('and it does not claim to have been split', keptWhole.split === false);

suite('Shelving papers into folders');

const shelved = shelve([
  { folder: 'Cambridge 18 / Reading — Multiple choice' },
  { folder: 'Cambridge 18 / Reading — Multiple choice' },
  { folder: 'Cambridge 18 / Writing' },
  { folder: 'Đề HSG 2024' },
  { folder: null },
]);
equal('every paper is counted once at the root', shelved.total, 5);
equal('the top level holds the books and the loose papers', shelved.root.children.size, 3);
equal('a folder counts everything inside it', shelved.root.children.get('Cambridge 18')?.count, 3);
equal('and its shelves are nested, not flattened',
  shelved.root.children.get('Cambridge 18')?.children.size, 2);
equal('a nested shelf knows its own full path',
  shelved.root.children.get('Cambridge 18')?.children.get('Writing')?.path,
  'Cambridge 18 / Writing');
check('a paper with no folder is not lost',
  (shelved.root.children.get(LOOSE)?.count ?? 0) === 1);

check('opening a book shows what is inside it',
  onShelf({ folder: 'Cambridge 18 / Writing' }, 'Cambridge 18'));
check('but not what is in the next book along',
  !onShelf({ folder: 'Cambridge 19 / Writing' }, 'Cambridge 18'));
check('and a folder whose name merely starts the same is not inside it',
  !onShelf({ folder: 'Cambridge 18b' }, 'Cambridge 18'));

suite('A key printed as one block per exercise');

/*
 * The commonest shape of all: the body numbers each exercise from 1, and so
 * does the key — one block per exercise, in order. Matching by number is
 * meaningless here (every exercise has a question 1), and counting everything
 * and hoping the totals agree breaks the moment the key has one block the body
 * does not. The blocks are paired with the papers by shape instead.
 */
const RUN_EX = 6;
const RUN_PER = 6;
const runSegments: BookSegment[] = Array.from({ length: RUN_EX }, (_, n) => ({
  title: `Ex ${n + 1}`,
  text: Array.from({ length: RUN_PER }, (_, i) =>
    `${i + 1}. Question ${n}-${i} ______ here.\nA. a   B. b   C. c   D. d`).join('\n'),
  index: n + 1,
  number: n + 1,
  by: 'restart' as const,
}));
const blockKey = Array.from({ length: RUN_EX }, (_, n) =>
  Array.from({ length: RUN_PER }, (_, i) => `${i + 1}. ${'ABCD'[(n * RUN_PER + i) % 4]}`).join('  ')).join('\n');

equal('every exercise is given a block', shareOutKey(runSegments, blockKey, 'restart', { trusted: true }), RUN_EX);
check('and each gets its own block, in step',
  runSegments.every((segment, n) =>
    (segment.keyText ?? '').startsWith(`1. ${'ABCD'[(n * RUN_PER) % 4]}`)),
  runSegments.map((x) => (x.keyText ?? 'none').slice(0, 5)).join(' '));

const shortKey = `${Array.from({ length: RUN_PER }, (_, i) => `${i + 1}. A`).join('  ')}`;
equal('a key with one block for a book of six is not spread across them',
  shareOutKey(runSegments.map((x) => ({ ...x, keyText: undefined })), shortKey, 'restart'), 0);

/* -------------------- reading a PDF, every time ------------------------ */

/**
 * The only checks here that have to wait for anything: reading a PDF is
 * asynchronous. They close the run, so `report()` lives inside.
 */
async function pdfChecks(): Promise<void> {
  suite('A PDF reads the same however memory is laid out');

  /*
   * The reader this replaced (`pdf-parse`, carrying a pdf.js from 2018) read
   * past the end of the buffer it was handed. Node pools small buffers, so the
   * same PDF parsed or failed depending on where it happened to sit in memory —
   * "bad XRef entry", "Command token too long: 128". A throwaway allocation
   * before the call is enough to swing it, which is what these runs do.
   */
  const probe = new URL('../../samples/pdf-probe.pdf', import.meta.url);
  for (const shift of [0, 1000, 2500]) {
    if (shift) Buffer.allocUnsafe(shift);
    const bytes = readFileSync(probe);
    const read = await extractFile('pdf-probe.pdf', 'application/pdf', bytes)
      .catch((err: Error) => ({ text: '', pages: 0, warnings: [err.message] }));
    check(`with ${shift} bytes of pool ahead of it, the text comes out`,
      /The manager/.test(read.text) && /ANSWER KEY/.test(read.text),
      read.warnings[0] ?? `got ${read.text.length} characters`);
  }


suite('A key at the back of a book that numbers every exercise from 1');

const LETTERS = 'ABCD';
const drillOf = (n: number, questions: number) => Array.from({ length: questions }, (_, i) =>
  `${i + 1}. Câu số ${n}-${i} với chỗ trống ______ trong câu này.\nA. one   B. two   C. three   D. four`).join('\n');

const eight = 8;
const thirteen = 13;
const restartBody = Array.from({ length: eight }, (_, i) => drillOf(i + 1, thirteen)).join('\n\n');
const flatKey = Array.from({ length: eight * thirteen }, (_, i) => `${i + 1}. ${LETTERS[i % 4]}`)
  .reduce<string[]>((rows, cell, i) => {
    if (i % 10 === 0) rows.push('');
    rows[rows.length - 1] = `${rows[rows.length - 1]} ${cell}`.trim();
    return rows;
  }, []).join('\n');

const shared = segmentBook(`${restartBody}\n\n${flatKey}`, { force: true });
equal('the book is cut into its exercises', shared.length, eight);
equal('every one of them gets a key', shared.filter((x) => !!x.keyText).length, eight);
/*
 * The point of the whole exercise: the papers all number from 1, the key runs
 * 1…104, so matching on the number would give all eight the same thirteen
 * answers. Paper 3 starts at answer 27, which in this pattern is "C".
 */
check('and the third paper gets the third slice, not the first',
  (shared[2].keyText ?? '').startsWith('1. C'), (shared[2].keyText ?? '').slice(0, 20));
check('the last paper gets the last slice',
  (shared[7].keyText ?? '').startsWith('1. D'), (shared[7].keyText ?? '').slice(0, 20));

check('a key with a heading is found too',
  segmentBook(`${restartBody}\n\nANSWERS\n${flatKey}`, { force: true }).every((x) => !!x.keyText));

const mismatched = segmentBook(
  `${Array.from({ length: eight }, (_, i) => `Exercise ${i + 1}\n${drillOf(i + 1, thirteen)}`).join('\n\n')}\n\nĐÁP ÁN\n1. A  2. B  3. C`,
);
equal('a key that is plainly for something else is refused, not spread about',
  mismatched.filter((x) => !!x.keyText).length, 0);

  suite('"The answers start on page 3"');

  const paged = readFileSync(new URL('../../samples/key-on-page-3.pdf', import.meta.url));
  const book = await extractFile('key-on-page-3.pdf', 'application/pdf', paged)
    .catch((err: Error) => ({ text: '', pages: 0, pageTexts: [] as string[], warnings: [err.message] }));
  equal('the pages come back one by one', book.pageTexts?.length, 3);
  check('the paper is on the first pages',
    /The manager/.test((book.pageTexts ?? [])[0] ?? ''));
  check('and the answers are on the third, under a heading nothing would recognise',
    /GHI CHU/.test((book.pageTexts ?? [])[2] ?? ''));

  /*
   * Cut where the operator says, and the key reaches the paper even though its
   * heading is a phrase no rule looks for. That is the whole point of asking
   * for a page number: it is the one thing about a PDF a teacher always knows.
   */
  const body = (book.pageTexts ?? []).slice(0, 2).join('\n\n');
  const keyPages = (book.pageTexts ?? []).slice(2).join('\n\n');
  // The grid on the last page is recognised for what it is, heading or none.
  check('a page of nothing but answers is recognised as the key',
    findKeyRegion(`${body}\n\n${keyPages}`) > 0);
  // And what is on that page reads as answers, which is what the paper is given.
  const fromPage = parseAnswerKey(keyPages, { whole: true });
  check('the answers on it are read as answers',
    Object.keys(fromPage).length >= 10, `${Object.keys(fromPage).length} read`);
  equal('and the first one is the letter printed against 1', fromPage[1], ['A']);

  // A book cut into papers shares the same page out between them.
  const twoSegments: BookSegment[] = [1, 2].map((n) => ({
    title: `Ex ${n}`,
    text: (book.pageTexts ?? [])[n - 1] ?? '',
    index: n,
    number: n,
    by: 'exercise' as const,
  }));
  check('two papers each get their half of it',
    shareOutKey(twoSegments, keyPages, 'exercise') === 2
      && !!twoSegments[0].keyText && !!twoSegments[1].keyText,
    twoSegments.map((x) => (x.keyText ?? 'none').slice(0, 12)).join(' | '));

  report();
}

void pdfChecks();
