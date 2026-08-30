'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExamContent, questionsOfPart } from '@/types/exam';
import { Annotation } from '@/lib/highlight';
import { AnswerValue } from '@/lib/grading';
import { Branding, SessionSettings } from '@/types/db';
import { ArrowLeft, ArrowRight } from '../ui/Icons';
import ExamHeader, { TimerBar } from './ExamHeader';
import SplitPane from './SplitPane';
import PassagePane from './PassagePane';
import QuestionGroupView, { Answers } from './QuestionGroupView';
import BottomBar from './BottomBar';
import OptionsScreen from './OptionsScreen';
import NotesPanel from './NotesPanel';
import ReviewScreen from './ReviewScreen';
import WaitingScreen from './WaitingScreen';
import AudioPlayer from './AudioPlayer';

export interface AttemptState {
  id: string;
  testTakerId: string;
  endsAt: string;
  startedAt: string;
  answers: Answers;
  annotations: Annotation[];
  flags: string[];
}

/** Invigilation rules for this sitting. */
export type ExamSecurity = Pick<SessionSettings,
  'blockCopyPaste' | 'trackFocusLoss' | 'lockPartOnLeave' | 'releaseResultsImmediately'>;

const NO_SECURITY: ExamSecurity = {
  blockCopyPaste: false, trackFocusLoss: false, lockPartOnLeave: false, releaseResultsImmediately: true,
};

const AUTOSAVE_MS = 1200;

export default function ExamShell({
  content, attempt, branding, security = NO_SECURITY, previewMode = false,
}: {
  content: ExamContent;
  attempt: AttemptState;
  branding: Branding;
  security?: ExamSecurity;
  previewMode?: boolean;
}) {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(attempt.answers ?? {});
  const [annotations, setAnnotations] = useState<Annotation[]>(attempt.annotations ?? []);
  const [flags, setFlags] = useState<string[]>(attempt.flags ?? []);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(
    () => questionsOfPart(content.parts[0])[0]?.number ?? null,
  );
  const [activeNote, setActiveNote] = useState<string | undefined>();

  const [notesOpen, setNotesOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contrast, setContrast] = useState('default');
  const [textSize, setTextSize] = useState('medium');
  const [online, setOnline] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [lockedParts, setLockedParts] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const totalSeconds = useMemo(
    () => Math.max(1, (new Date(attempt.endsAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000),
    [attempt.endsAt, attempt.startedAt],
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (new Date(attempt.endsAt).getTime() - Date.now()) / 1000));

  const part = content.parts[partIndex];
  const questionPaneRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ boot ------------------------------ */

  useEffect(() => {
    const t = setTimeout(() => setReady(true), previewMode ? 300 : 2200);
    return () => clearTimeout(t);
  }, [previewMode]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
    document.documentElement.dataset.textsize = textSize;
  }, [contrast, textSize]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ------------------------------ timer ----------------------------- */

  const submit = useCallback(async (auto = false) => {
    if (previewMode) { setReviewOpen(false); alert('Preview mode — nothing was submitted.'); return; }
    setSubmitting(true);
    await fetch(`/api/attempts/${attempt.id}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers, annotations, flags, auto }),
    });
    router.push(`/results/${attempt.id}`);
  }, [answers, annotations, attempt.id, flags, previewMode, router]);

  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, (new Date(attempt.endsAt).getTime() - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) { clearInterval(id); void submit(true); }
    }, 1000);
    return () => clearInterval(id);
  }, [attempt.endsAt, submit]);

  /* ----------------------------- autosave --------------------------- */

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const queueSave = useCallback((payload: { answers?: Answers; annotations?: Annotation[]; flags?: string[] }) => {
    if (previewMode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/attempts/${attempt.id}/answers`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSaveError(!res.ok);
      } catch { setSaveError(true); }
    }, AUTOSAVE_MS);
  }, [attempt.id, previewMode]);

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      queueSave({ answers: next });
      return next;
    });
  }, [queueSave]);

  const toggleFlag = useCallback((questionId: string) => {
    setFlags((prev) => {
      const next = prev.includes(questionId) ? prev.filter((f) => f !== questionId) : [...prev, questionId];
      queueSave({ flags: next });
      return next;
    });
  }, [queueSave]);

  const updateAnnotations = useCallback((next: Annotation[]) => {
    setAnnotations(next);
    queueSave({ annotations: next });
  }, [queueSave]);

  /* --------------------------- navigation --------------------------- */

  const goToQuestion = useCallback((n: number) => {
    const targetPart = content.parts.findIndex((p) => questionsOfPart(p).some((q) => q.number === n));
    if (targetPart >= 0 && targetPart !== partIndex) setPartIndex(targetPart);
    setActiveQuestion(n);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-question="${n}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [content.parts, partIndex]);

  const allNumbers = useMemo(
    () => content.parts.flatMap((p) => questionsOfPart(p).map((q) => q.number)), [content.parts]);

  const step = useCallback((delta: number) => {
    const current = activeQuestion ?? allNumbers[0];
    const i = allNumbers.indexOf(current);
    const next = allNumbers[Math.min(allNumbers.length - 1, Math.max(0, i + delta))];
    if (next !== undefined) goToQuestion(next);
  }, [activeQuestion, allNumbers, goToQuestion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input, textarea, select')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /* --------------------------- invigilation ------------------------- */

  const logEvent = useCallback((type: string, meta: Record<string, unknown> = {}) => {
    if (previewMode) return;
    void fetch(`/api/attempts/${attempt.id}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, meta }),
      keepalive: true,
    }).catch(() => undefined);
  }, [attempt.id, previewMode]);

  useEffect(() => {
    if (!security.trackFocusLoss) return;
    let awayAt = 0;
    const hidden = () => {
      if (document.visibilityState === 'hidden') { awayAt = Date.now(); logEvent('focus-lost'); }
      else if (awayAt) {
        logEvent('focus-regained', { awayMs: Date.now() - awayAt });
        setNotice('You left the exam window. The invigilator has been notified.');
        awayAt = 0;
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [security.trackFocusLoss, logEvent]);

  useEffect(() => {
    if (!security.blockCopyPaste) return;
    const stop = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea')) { e.preventDefault(); logEvent('paste-blocked'); }
    };
    const stopCopy = (e: Event) => e.preventDefault();
    document.addEventListener('paste', stop, true);
    document.addEventListener('copy', stopCopy, true);
    document.addEventListener('cut', stopCopy, true);
    return () => {
      document.removeEventListener('paste', stop, true);
      document.removeEventListener('copy', stopCopy, true);
      document.removeEventListener('cut', stopCopy, true);
    };
  }, [security.blockCopyPaste, logEvent]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!ready) return <WaitingScreen />;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TimerBar remaining={remaining} total={totalSeconds} />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <ExamHeader
            branding={branding}
            testTakerId={attempt.testTakerId}
            online={online && !saveError}
            notesOpen={notesOpen}
            menuOpen={optionsOpen}
            alerts={saveError ? 1 : 0}
            remaining={remaining}
            onBell={() => alert(saveError
              ? 'Your last answer could not be saved. Check your connection — the exam keeps trying automatically.'
              : 'No messages from the invigilator.')}
            onToggleMenu={() => setOptionsOpen(true)}
            onToggleNotes={() => setNotesOpen((v) => !v)}
          />

          <div className="px-[20px] pt-[10px] pb-[6px]">
            <div className="exam-banner px-[24px] py-[16px]" style={{ background: 'var(--banner)' }}>
              {part.section && (
                <p className="text-[14px] font-semibold uppercase tracking-[0.1em] mb-[6px]" style={{ color: 'var(--brand)' }}>
                  {part.section}
                </p>
              )}
              <p className="text-[19px] font-bold mb-[4px]">{part.title}</p>
              <p className="text-[19px]">{part.instructions}</p>
            </div>
            {notice && (
              <div role="status" className="mt-[8px] px-[24px] py-[12px] text-[17px] rounded-[4px]"
                   style={{ background: '#FFFCF0', border: '1px solid #EFE3B0' }}>
                {notice}
              </div>
            )}
          </div>

          {part.passage ? (
            <SplitPane
              left={
                <PassagePane
                  partId={part.id}
                  title={part.passage.title}
                  html={part.passage.html}
                  annotations={annotations}
                  activeId={activeNote}
                  onChange={updateAnnotations}
                  onOpenNote={(id) => { setActiveNote(id); setNotesOpen(true); }}
                />
              }
              right={
                <div ref={questionPaneRef} className="pt-[22px] pb-[70px] pr-[16px]">
                  {part.audioUrl && <AudioPlayer src={part.audioUrl} playOnce={part.audioPlayOnce !== false} />}
                  {part.groups.map((g) => (
                    <QuestionGroupView
                      key={g.id}
                      group={g}
                      answers={answers}
                      flags={flags}
                      activeQuestion={activeQuestion}
                      onAnswer={setAnswer}
                      onFocusQuestion={setActiveQuestion}
                      onToggleFlag={toggleFlag}
                      blockPaste={security.blockCopyPaste}
                    />
                  ))}
                </div>
              }
            />
          ) : (
            <div className="flex-1 min-h-0 exam-scroll px-[24px] pt-[22px] pb-[70px]">
              <div className="max-w-[960px] mx-auto">
                {part.audioUrl && <AudioPlayer src={part.audioUrl} playOnce={part.audioPlayOnce !== false} />}
                {part.groups.map((g) => (
                  <QuestionGroupView
                    key={g.id}
                    group={g}
                    answers={answers}
                    flags={flags}
                    activeQuestion={activeQuestion}
                    onAnswer={setAnswer}
                    onFocusQuestion={setActiveQuestion}
                    onToggleFlag={toggleFlag}
                    blockPaste={security.blockCopyPaste}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <div className="absolute right-[44px] bottom-[86px] flex z-20">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous question"
                className="w-[88px] h-[82px] flex items-center justify-center focus-ring"
                style={{ background: '#DDDDDD', color: '#1e1e1e' }}
              >
                <ArrowLeft />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next question"
                className="w-[88px] h-[82px] flex items-center justify-center text-white focus-ring"
                style={{ background: '#000000' }}
              >
                <ArrowRight />
              </button>
            </div>

            <BottomBar
              content={content}
              partIndex={partIndex}
              answers={answers}
              flags={flags}
              activeQuestion={activeQuestion}
              onGoToPart={(i) => {
                const target = content.parts[i];
                if (lockedParts.includes(target.id)) {
                  setNotice(`${target.title} has been submitted and cannot be reopened.`);
                  return;
                }
                if (security.lockPartOnLeave) setLockedParts((prev) => [...prev, part.id]);
                setPartIndex(i);
                setActiveQuestion(questionsOfPart(target)[0]?.number ?? null);
              }}
              onGoToQuestion={goToQuestion}
              onReview={() => setReviewOpen(true)}
            />
          </div>
        </div>

        {notesOpen && (
          <NotesPanel
            annotations={annotations.filter((a) => a.partId === part.id)}
            activeId={activeNote}
            onClose={() => setNotesOpen(false)}
            onSelect={setActiveNote}
            onChangeNote={(id, note) =>
              updateAnnotations(annotations.map((a) => (a.id === id ? { ...a, note } : a)))}
            onDelete={(id) => updateAnnotations(annotations.filter((a) => a.id !== id))}
          />
        )}
      </div>

      {optionsOpen && (
        <OptionsScreen
          contrast={contrast}
          textSize={textSize}
          onContrast={setContrast}
          onTextSize={setTextSize}
          onClose={() => setOptionsOpen(false)}
          onSubmitPage={() => { setOptionsOpen(false); setReviewOpen(true); }}
        />
      )}

      {reviewOpen && (
        <ReviewScreen
          content={content}
          answers={answers}
          flags={flags}
          submitting={submitting}
          onClose={() => setReviewOpen(false)}
          onJump={(pi, n) => { setReviewOpen(false); setPartIndex(pi); goToQuestion(n); }}
          onSubmit={() => submit(false)}
        />
      )}
    </div>
  );
}
