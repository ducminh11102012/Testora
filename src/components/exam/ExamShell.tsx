'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExamContent, audioFor, isListeningPart, listeningParts, questionsOfPart,
} from '@/types/exam';
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
import ListeningGate from './ListeningGate';

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
  'blockCopyPaste' | 'trackFocusLoss' | 'lockPartOnLeave' | 'releaseResultsImmediately'
  | 'requireFullscreen' | 'blockRightClick' | 'maxFocusLoss'>;

const NO_SECURITY: ExamSecurity = {
  blockCopyPaste: false, trackFocusLoss: false, lockPartOnLeave: false, releaseResultsImmediately: true,
  requireFullscreen: false, blockRightClick: false, maxFocusLoss: 0,
};

const AUTOSAVE_MS = 1200;

export default function ExamShell({
  content, attempt, branding, security = NO_SECURITY, previewMode = false, untimed = false,
  audioStartedAt = {},
}: {
  content: ExamContent;
  attempt: AttemptState;
  branding: Branding;
  security?: ExamSecurity;
  previewMode?: boolean;
  /**
   * When each recording was first started, by part id — or `paper` for a
   * paper-wide tape. Read from the attempt's own event trail, so reloading the
   * page cannot wind a once-only recording back to the beginning.
   */
  audioStartedAt?: Record<string, string>;
  /**
   * No time limit: no clock, no automatic hand-in, and the candidate may leave
   * and come back another day. Papers that state no time are sat this way.
   */
  untimed?: boolean;
}) {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(attempt.answers ?? {});
  const [annotations, setAnnotations] = useState<Annotation[]>(attempt.annotations ?? []);
  const [flags, setFlags] = useState<string[]>(attempt.flags ?? []);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(
    // `parts[0]` can be missing on a hand-edited paper; the render guards too.
    () => (content.parts[0] ? questionsOfPart(content.parts[0])[0]?.number ?? null : null),
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
  const [handingIn, setHandingIn] = useState<null | 'time' | 'integrity'>(null);
  const [awayCount, setAwayCount] = useState(0);
  /** Listening parts whose recording the candidate has already started. */
  // Recordings already running when this page loaded stay running.
  const [audioStarted, setAudioStarted] = useState<string[]>(() => Object.keys(audioStartedAt));
  const submitted = useRef(false);

  /**
   * A clock that says "8759 hours left" is not a clock. An attempt started
   * before the untimed flag existed — or by any path that forgets to set it —
   * has an end date a year out, so anything beyond a day is treated as no
   * limit rather than shown as a countdown.
   */
  const noClock = untimed
    || (new Date(attempt.endsAt).getTime() - new Date(attempt.startedAt).getTime()) > 36 * 3_600_000;

  const totalSeconds = useMemo(
    () => Math.max(1, (new Date(attempt.endsAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000),
    [attempt.endsAt, attempt.startedAt],
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (new Date(attempt.endsAt).getTime() - Date.now()) / 1000));

  const part = content.parts[partIndex];
  const questionPaneRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ boot ------------------------------ */

  useEffect(() => {
    const t = setTimeout(() => setReady(true), previewMode ? 300 : 2200);
    return () => clearTimeout(t);
  }, [previewMode]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
    document.documentElement.dataset.textsize = textSize;
  }, [contrast, textSize]);

  /**
   * Nothing may scroll the exam shell itself. Focus moving to a visually
   * hidden control used to scroll this box — which has no scrollbar — and the
   * whole screen slid away, leaving the candidate looking at blank white. The
   * question pane scrolls; the furniture around it does not.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const reset = () => {
      if (surface.scrollTop !== 0) surface.scrollTop = 0;
      if (surface.scrollLeft !== 0) surface.scrollLeft = 0;
    };
    surface.addEventListener('scroll', reset, { passive: true });
    window.addEventListener('focusin', reset);
    return () => {
      surface.removeEventListener('scroll', reset);
      window.removeEventListener('focusin', reset);
    };
  }, [ready]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ------------------------------ timer ----------------------------- */

  const submitRef = useRef<(auto?: boolean) => Promise<void>>();

  const submit = useCallback(async (auto = false) => {
    if (previewMode) { setReviewOpen(false); alert('Preview mode — nothing was submitted.'); return; }
    // Two ways in — the button and the clock — and only one hand-in.
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/attempts/${attempt.id}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers, annotations, flags, auto }),
      });
      const outcome = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(outcome.error || `The paper could not be handed in (${res.status}).`);
      /*
       * Back to the hub for the next section, carrying the sitting code so the
       * section that follows is recorded against the same sitting — except
       * after a practice run, which the hub deliberately knows nothing about
       * and which therefore goes straight to its own result page.
       */
      const code = new URLSearchParams(window.location.search).get('code');
      router.push(outcome.suiteId
        ? `/suite/${outcome.suiteId}${code ? `?code=${encodeURIComponent(code)}` : ''}`
        : `/results/${attempt.id}`);
    } catch (err) {
      // A hand-in that failed is not a hand-in: release the latch, say so, and
      // let the candidate try again. Time-up keeps trying on its own, because
      // there is nothing else the candidate can do about a dropped connection.
      submitted.current = false;
      setSubmitting(false);
      setHandingIn(null);
      const dropped = (err as Error).name === 'TypeError' || /failed to fetch|network/i.test((err as Error).message);
      setNotice(dropped
        ? 'The connection dropped before the paper could be handed in. Your answers are saved — please try again.'
        : `${(err as Error).message} Your answers are saved — please try again.`);
      if (auto) window.setTimeout(() => { void submitRef.current?.(true); }, 15_000);
    }
  }, [answers, annotations, attempt.id, flags, previewMode, router]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

  useEffect(() => {
    // Nothing to count down to, so nothing to count.
    if (noClock) return;
    const tick = () => {
      const left = Math.max(0, (new Date(attempt.endsAt).getTime() - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        setHandingIn('time');
        void submit(true);
      }
    };
    // The clock is the server's: `endsAt` is read afresh every second, so a
    // sleeping laptop or a fiddled system clock cannot buy extra minutes.
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [attempt.endsAt, submit, noClock]);

  /* ----------------------------- autosave --------------------------- */

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  type SavePayload = { answers?: Answers; annotations?: Annotation[]; flags?: string[] };
  const pending = useRef<SavePayload>({});

  // Every kind of change shares one debounce, so they also share one payload:
  // a queued answer must not be thrown away by a note written a moment later.
  const queueSave = useCallback((payload: SavePayload) => {
    if (previewMode) return;
    pending.current = { ...pending.current, ...payload };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      const keep = () => { pending.current = { ...body, ...pending.current }; };
      try {
        const res = await fetch(`/api/attempts/${attempt.id}/answers`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        // Time-up is not a network problem: the hand-in is already under way.
        const expired = res.status === 409;
        if (!res.ok && !expired) keep();
        setSaveError(!res.ok && !expired);
      } catch { keep(); setSaveError(true); }
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

  /**
   * The single door between parts. The part tabs, the number line, the arrow
   * keys, the prev/next buttons and the review screen all come through here,
   * so a locked part is locked whichever way it is approached.
   */
  const enterPart = useCallback((i: number): boolean => {
    if (i === partIndex) return true;
    const target = content.parts[i];
    if (!target) return false;
    if (lockedParts.includes(target.id)) {
      setNotice(`${target.title} has been submitted and cannot be reopened.`);
      return false;
    }
    if (security.lockPartOnLeave) {
      const leaving = content.parts[partIndex];
      if (leaving) setLockedParts((prev) => (prev.includes(leaving.id) ? prev : [...prev, leaving.id]));
    }
    setPartIndex(i);
    return true;
  }, [content.parts, lockedParts, partIndex, security.lockPartOnLeave]);

  const goToQuestion = useCallback((n: number) => {
    const targetPart = content.parts.findIndex((p) => questionsOfPart(p).some((q) => q.number === n));
    if (targetPart >= 0 && !enterPart(targetPart)) return;
    setActiveQuestion(n);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-question="${n}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [content.parts, enterPart]);

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
    const leave = () => { if (!awayAt) { awayAt = Date.now(); logEvent('focus-lost'); } };
    const back = () => {
      if (!awayAt) return;
      const awayMs = Date.now() - awayAt;
      awayAt = 0;
      logEvent('focus-regained', { awayMs });
      setAwayCount((n) => {
        const next = n + 1;
        const limit = security.maxFocusLoss ?? 0;
        if (limit > 0 && next >= limit) {
          setHandingIn('integrity');
          logEvent('auto-submit', { reason: 'focus-limit', count: next });
          void submit(true);
        } else {
          setNotice(limit > 0
            ? `You left the exam window (${next} of ${limit} allowed). The invigilator can see this.`
            : 'You left the exam window. The invigilator has been notified.');
        }
        return next;
      });
    };
    const hidden = () => (document.visibilityState === 'hidden' ? leave() : back());
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [security.trackFocusLoss, security.maxFocusLoss, logEvent, submit]);

  /** The right-click menu is where copying usually starts. */
  useEffect(() => {
    if (!security.blockRightClick) return;
    const stop = (e: MouseEvent) => { e.preventDefault(); logEvent('context-menu-blocked'); };
    document.addEventListener('contextmenu', stop);
    return () => document.removeEventListener('contextmenu', stop);
  }, [security.blockRightClick, logEvent]);

  /**
   * Full screen cannot be forced on a browser, so this asks for it and records
   * every exit. The invigilator sees the trail; nobody is locked out of their
   * own machine.
   */
  useEffect(() => {
    if (!security.requireFullscreen || previewMode) return;
    const ask = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {
          setNotice('This sitting asks for full screen. Press F11 if the browser refuses.');
        });
      }
    };
    const changed = () => {
      if (!document.fullscreenElement) {
        logEvent('fullscreen-exit');
        setNotice('Full screen was closed. The invigilator can see this.');
      }
    };
    ask();
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [security.requireFullscreen, previewMode, logEvent]);

  useEffect(() => {
    if (!security.blockCopyPaste) return;
    const stop = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea')) { e.preventDefault(); logEvent('paste-blocked'); }
    };
    const stopCopy = (e: Event) => { e.preventDefault(); logEvent('copy-blocked'); };
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

  // A paper with nothing in it cannot be sat. It should never reach here — the
  // import refuses to create one — but a hand-edited paper could, and a blank
  // screen with a TypeError behind it is the worst way to find out.
  if (!part) {
    return (
      <WaitingScreen
        title="This paper is empty"
        subtitle="There are no questions in it yet. Tell your centre — nothing you do here can be marked."
      />
    );
  }

  if (handingIn) {
    return (
      <WaitingScreen
        title={handingIn === 'time' ? 'Time is up' : 'The paper has been handed in'}
        subtitle={handingIn === 'time'
          ? 'Your answers are being handed in. Do not close this window.'
          : 'You left the exam window too many times, so the paper was handed in.'}
      />
    );
  }

  /*
   * The recording for this part: its own file, or the paper's one tape running
   * across every section. A paper-wide tape is identified as `paper` so that
   * moving from Part 1 to Part 2 does not count as a new recording — the tape
   * has not stopped, and it must not start again.
   */
  const audio = audioFor(content, part);
  const audioKey = audio?.scope === 'paper' ? 'paper' : part?.id ?? '';
  const audioLive = !!audio && audioStarted.includes(audioKey);
  // Where the tape would be by now, for a candidate who reloaded the page.
  const resumeFrom = audioLive && audioStartedAt[audioKey]
    ? Math.max(0, (Date.now() - new Date(audioStartedAt[audioKey]).getTime()) / 1000)
    : 0;

  const spanned = audio?.scope === 'paper' ? listeningParts(content) : [];
  const audioNote = audio?.scope === 'paper' && spanned.length > 1
    ? `One recording covers ${spanned.map((p) => p.title).join(', ')}.`
    : undefined;

  const startAudio = () => {
    if (!audio || audioStarted.includes(audioKey)) return;
    setAudioStarted((prev) => [...prev, audioKey]);
    // Written down so a reload resumes the tape instead of replaying it.
    if (!previewMode) logEvent('audio-start', { key: audioKey, scope: audio.scope });
  };

  // A listening part waits behind an announcement: the recording plays once,
  // and the candidate should know that before it starts.
  const needsGate = !previewMode && !!audio && audio.playOnce && !audioLive
    && (audio.scope === 'paper' || isListeningPart(part));

  return (
    <div ref={surfaceRef} className="h-screen flex flex-col overflow-clip exam-surface">
      {needsGate && (
        <ListeningGate
          partTitle={audio?.scope === 'paper' && spanned.length > 1
            ? content.title
            : part.section ? `${part.section} · ${part.title}` : part.title}
          questionCount={audio?.scope === 'paper' && spanned.length > 1
            ? spanned.reduce((n, p) => n + questionsOfPart(p).length, 0)
            : questionsOfPart(part).length}
          partCount={audio?.scope === 'paper' ? spanned.length : 1}
          partNames={audio?.scope === 'paper' && spanned.length > 1 ? spanned.map((p) => p.title) : undefined}
          onStart={startAudio}
        />
      )}
      <TimerBar remaining={remaining} total={totalSeconds} untimed={noClock} />

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
            untimed={noClock}
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

          {/*
            * A paper-wide recording is mounted here, outside the part panes: it
            * has to survive moving from one part to the next, and anything
            * inside the panes is thrown away and rebuilt when the part changes,
            * which would stop the tape.
            */}
          {audio?.scope === 'paper' && (
            <div className="px-[24px] pt-[10px]">
              <div className="max-w-[960px] mx-auto">
                <AudioPlayer
                  key="paper-audio"
                  src={audio.src}
                  playOnce={audio.playOnce}
                  autoStart={audioLive}
                  resumeFrom={resumeFrom}
                  note={audioNote}
                />
              </div>
            </div>
          )}

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
                  {audio?.scope === 'part' && (
                    <AudioPlayer
                      key={part.id}
                      src={audio.src}
                      playOnce={audio.playOnce}
                      autoStart={audioLive}
                      resumeFrom={resumeFrom}
                    />
                  )}
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
                {audio?.scope === 'part' && (
                  <AudioPlayer
                    key={part.id}
                    src={audio.src}
                    playOnce={audio.playOnce}
                    autoStart={audioLive}
                    resumeFrom={resumeFrom}
                  />
                )}
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
                if (!enterPart(i)) return;
                setActiveQuestion(questionsOfPart(content.parts[i])[0]?.number ?? null);
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
          onJump={(_pi, n) => { setReviewOpen(false); goToQuestion(n); }}
          onSubmit={() => submit(false)}
        />
      )}
    </div>
  );
}
