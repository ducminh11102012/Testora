'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The two decisions staff change after a sitting has run: whether candidates
 * may see their score, and whether they may see the answers. Held results stay
 * held until the button here is pressed.
 */
export default function SittingControls({
  sittingId, released, showAnswers,
}: {
  sittingId: string; released: boolean; showAnswers: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(settings: Record<string, boolean>, label: string) {
    setBusy(label);
    await fetch(`/api/admin/sessions/${sittingId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-[14px] mb-[26px]">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => patch({ releaseResultsImmediately: !released }, 'release')}
        className="px-[18px] h-[44px] rounded-[4px] text-[16px] text-white disabled:opacity-60"
        style={{ background: released ? 'var(--paper-ink-2)' : 'var(--brand)' }}
      >
        {busy === 'release' ? 'Saving…' : released ? 'Hold results back' : 'Release results to candidates'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => patch({ showAnswers: !showAnswers }, 'answers')}
        className="px-[18px] h-[44px] rounded-[4px] text-[16px] border border-[color:var(--line-strong)] disabled:opacity-60"
      >
        {busy === 'answers' ? 'Saving…' : showAnswers ? 'Stop showing the answers' : 'Show candidates the answers'}
      </button>
      <span className="text-[15px] text-[color:var(--paper-ink-3)]">
        {released
          ? 'Candidates can see their score as soon as marking finishes.'
          : 'Candidates see only that the paper was handed in.'}
      </span>
    </div>
  );
}
