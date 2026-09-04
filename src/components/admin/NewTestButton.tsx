'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewTestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch('/api/admin/tests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ module: 'reading', title: 'Untitled test' }),
        });
        const { id } = await res.json();
        router.push(`/admin/tests/${id}`);
      }}
      className="px-[20px] h-[44px] text-white rounded-[3px] text-[17px] disabled:opacity-60"
      style={{ background: 'var(--brand)' }}
    >
      {busy ? 'Creating…' : 'New test'}
    </button>
  );
}
