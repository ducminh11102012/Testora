'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StartTestButton({
  testId, priceCredits = 0, label,
}: { testId: string; priceCredits?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null);
          const res = await fetch('/api/attempts', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setBusy(false); setError(data.error ?? 'This paper could not be started.'); return; }
          router.push(data.suiteId ? `/suite/${data.suiteId}` : `/test/${data.attemptId}`);
        }}
        className="p-btn disabled:opacity-60"
      >
        {busy ? 'Starting…' : label ?? (priceCredits > 0 ? `Start · ${priceCredits} credit${priceCredits === 1 ? '' : 's'}` : 'Start test')}
      </button>
      {error && <p className="mt-[10px] text-[15px] text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}
