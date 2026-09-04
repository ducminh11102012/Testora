'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OrgSwitcher({
  current, options, isPlatformAdmin,
}: {
  current: { id: string; name: string; kind: string };
  options: { id: string; name: string; role: string }[];
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (options.length <= 1 && !isPlatformAdmin) {
    return (
      <div className="px-[6px]">
        <div className="text-[12px] uppercase tracking-wide text-[color:var(--paper-ink-3)] mb-[4px]">Organisation</div>
        <div className="text-[16px] font-semibold leading-snug">{current.name}</div>
      </div>
    );
  }

  return (
    <label className="block px-[6px]">
      <span className="block text-[12px] uppercase tracking-wide text-[color:var(--paper-ink-3)] mb-[6px]">Organisation</span>
      <select
        value={current.id}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await fetch('/api/auth/switch-org', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ orgId: e.target.value }),
          });
          router.push('/admin');
          router.refresh();
          setBusy(false);
        }}
        className="admin-input"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
