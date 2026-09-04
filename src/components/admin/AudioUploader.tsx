'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The recording for a listening paper. A parsed paper arrives with the
 * questions but no sound, so this is the step between importing a listening
 * paper and being able to publish it. Centres that already host their audio
 * paste a link instead of uploading anything.
 *
 * Two shapes, because papers come both ways: **one tape for the whole paper**,
 * which is how a real examination runs (`partId` is the word `paper`), and **a
 * file per section** for papers published that way. A section's own file is
 * what that section plays; otherwise it plays the paper's tape.
 */
export default function AudioUploader({
  testId, partId, partTitle, audioUrl, playOnce, covers, optional = false, onPlayOnce, onAudioUrl,
}: {
  testId: string;
  /** A part id, or `paper` for one recording covering the whole paper. */
  partId: string;
  partTitle: string;
  audioUrl?: string;
  playOnce: boolean;
  /** The parts one tape runs across, for the line that explains it. */
  covers?: string[];
  /** True for a section-level override: its absence is not a problem. */
  optional?: boolean;
  onPlayOnce: (value: boolean) => void;
  /**
   * The upload writes straight into the saved paper, so the editor's own draft
   * has to be told as well — otherwise the next Save would write the draft back
   * over it and detach the recording.
   */
  onAudioUrl: (url: string | undefined) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(body: FormData) {
    setBusy(true); setMessage(null);
    const res = await fetch(`/api/admin/tests/${testId}/audio`, { method: 'POST', body });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? 'The recording could not be attached.'); return; }
    setMessage(data.storedIn?.length ? `Saved to ${data.storedIn.join(', ')}.` : 'Saved.');
    onAudioUrl(data.audioUrl as string);
    if (fileRef.current) fileRef.current.value = '';
    setLink('');
    router.refresh();
  }

  async function upload(file: File) {
    const body = new FormData();
    body.set('partId', partId);
    body.set('file', file);
    await send(body);
  }

  async function attach() {
    if (!link.trim()) return;
    const body = new FormData();
    body.set('partId', partId);
    body.set('url', link.trim());
    await send(body);
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/admin/tests/${testId}/audio?partId=${encodeURIComponent(partId)}`, { method: 'DELETE' });
    setBusy(false);
    setMessage('Removed.');
    onAudioUrl(undefined);
    router.refresh();
  }

  return (
    <div className="border rounded-[4px] p-[16px] mb-[22px]"
         style={{
           background: audioUrl ? '#F1F7F1' : optional ? 'transparent' : '#FFFCF0',
           borderColor: audioUrl ? '#CFE3CF' : optional ? 'var(--line)' : '#EFE3B0',
         }}>
      <p className="text-[15px] font-semibold mb-[4px]">Recording for {partTitle}</p>
      {covers && covers.length > 1 && (
        <p className="text-[14px] text-[color:var(--paper-ink-3)] mb-[6px]">
          One tape, running across {covers.join(', ')} without stopping — the candidate presses play
          once and it carries on as they move from section to section.
        </p>
      )}
      {audioUrl ? (
        <>
          <audio controls src={audioUrl} className="w-full max-w-[520px] my-[10px]" />
          <div className="flex items-center gap-[16px] flex-wrap text-[15px]">
            <label className="flex items-center gap-[8px]">
              <input type="checkbox" checked={playOnce} onChange={(e) => onPlayOnce(e.target.checked)} />
              Plays once, cannot be paused or wound back
            </label>
            <button type="button" onClick={remove} disabled={busy} className="underline text-[color:var(--bad)]">
              Remove the recording
            </button>
          </div>
          <p className="text-[14px] text-[color:var(--paper-ink-3)] mt-[6px]">
            Candidates read a notice and press play themselves; the recording then runs to the end
            while they answer. Staff can scrub this preview — candidates cannot.
          </p>
        </>
      ) : (
        <p className="text-[15px] mb-[10px]">
          {optional
            ? 'This section has no file of its own, so it plays the paper’s recording. Add one only if this section really is a separate tape.'
            : 'There is no recording yet, so the paper cannot be published. Upload an MP3 (64 kbps mono keeps a 30-minute paper well under the size limit), or paste a link to a file you already host.'}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-[14px] mt-[12px]">
        <label className="block">
          <span className="block text-[13px] font-semibold mb-[4px]">Upload a file</span>
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.m4a,.aac,.ogg,.wav,audio/*"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="admin-input pt-[9px]"
          />
        </label>
        <label className="block flex-1 min-w-[260px]">
          <span className="block text-[13px] font-semibold mb-[4px]">…or paste a link</span>
          <input
            className="admin-input font-mono"
            placeholder="https://…/section-1.mp3"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button type="button" onClick={attach} disabled={busy || !link.trim()}
                className="px-[16px] h-[42px] border border-[color:var(--line-strong)] rounded-[3px] text-[15px] disabled:opacity-50">
          {busy ? 'Working…' : 'Use this link'}
        </button>
      </div>
      {message && <p className="text-[15px] mt-[10px]">{message}</p>}
    </div>
  );
}
