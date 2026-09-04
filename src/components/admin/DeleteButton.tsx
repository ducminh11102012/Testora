'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One delete control for every kind of row in the console. It asks once, and if
 * the server refuses because something has already been sat, it repeats the
 * server's own explanation and asks a second time before forcing.
 */
export default function DeleteButton({
  url, what, label = 'Delete', redirectTo, onDeleted,
}: {
  /** The API path that deletes the thing. */
  url: string;
  /** What the confirmation calls it, e.g. `the paper "Reading 1"`. */
  what: string;
  label?: string;
  /** Where to go afterwards; without it the current screen just refreshes. */
  redirectTo?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  async function run(force: boolean) {
    setBusy(true);
    const res = await fetch(force ? `${url}${url.includes('?') ? '&' : '?'}force=1` : url, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.status === 409 && data.needsConfirmation) {
      setWarning(data.error as string);
      setConfirming(true);
      return;
    }
    if (!res.ok) { setWarning(data.error ?? 'It could not be deleted.'); return; }

    setConfirming(false); setWarning(null);
    onDeleted?.();
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  if (!confirming && !warning) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete ${what}? This cannot be undone.`)) void run(false);
        }}
        className="underline text-[color:var(--bad)] disabled:opacity-50"
      >
        {busy ? 'Deleting…' : label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-[6px] text-left">
      {warning && <span className="text-[14px] text-[color:var(--bad)] max-w-[320px]">{warning}</span>}
      <span className="flex gap-[10px]">
        {confirming && (
          <button type="button" disabled={busy} onClick={() => void run(true)}
                  className="underline text-[color:var(--bad)] disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete anyway'}
          </button>
        )}
        <button type="button" onClick={() => { setConfirming(false); setWarning(null); }} className="underline">
          Keep
        </button>
      </span>
    </span>
  );
}
