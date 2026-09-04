'use client';

import { useMemo, useState } from 'react';

export interface UsageRow {
  orgId: string | null; orgName: string | null; feature: string; calls: number;
  inputTokens: number; outputTokens: number; costMicros: number;
}

const FEATURE_LABEL: Record<string, string> = {
  parse: 'Paper import',
  'writing-marking': 'Writing marking',
  'transform-judging': 'Transformation judging',
  'connection-test': 'Connection test',
};

const cents = (micros: number) => micros / 10_000;

export default function UsageTable({ rows, showOrg = true }: { rows: UsageRow[]; showOrg?: boolean }) {
  const [feature, setFeature] = useState('');
  const features = useMemo(() => Array.from(new Set(rows.map((r) => r.feature))).sort(), [rows]);
  const shown = rows.filter((r) => !feature || r.feature === feature);

  const total = shown.reduce((acc, r) => ({
    calls: acc.calls + r.calls,
    inputTokens: acc.inputTokens + r.inputTokens,
    outputTokens: acc.outputTokens + r.outputTokens,
    costMicros: acc.costMicros + r.costMicros,
  }), { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 });

  function exportCsv() {
    const header = ['Organisation', 'Feature', 'Calls', 'Input tokens', 'Output tokens', 'Cost (US cents)'];
    const lines = shown.map((r) => [
      r.orgName ?? 'Platform', FEATURE_LABEL[r.feature] ?? r.feature,
      r.calls, r.inputTokens, r.outputTokens, cents(r.costMicros).toFixed(4),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ai-usage.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <p className="text-[18px] text-[color:var(--paper-ink-3)]">No model calls have been made yet.</p>;
  }

  return (
    <>
      <div className="flex items-end gap-[14px] mb-[18px] flex-wrap">
        <label className="block">
          <span className="block text-[14px] font-semibold mb-[6px]">Feature</span>
          <select className="admin-input w-auto" value={feature} onChange={(e) => setFeature(e.target.value)}>
            <option value="">All features</option>
            {features.map((f) => <option key={f} value={f}>{FEATURE_LABEL[f] ?? f}</option>)}
          </select>
        </label>
        <button type="button" onClick={exportCsv}
                className="px-[18px] h-[44px] border border-[color:var(--line-strong)] rounded-[4px] text-[16px]">
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[color:var(--line)]">
              {showOrg && <th className="py-[10px] font-semibold">Organisation</th>}
              <th className="py-[10px] font-semibold w-[210px]">Feature</th>
              <th className="py-[10px] font-semibold w-[100px] text-right">Calls</th>
              <th className="py-[10px] font-semibold w-[150px] text-right">Input tokens</th>
              <th className="py-[10px] font-semibold w-[150px] text-right">Output tokens</th>
              <th className="py-[10px] font-semibold w-[140px] text-right">Cost (¢)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-[color:var(--line)]">
                {showOrg && <td className="py-[11px]">{r.orgName ?? <span className="text-[color:var(--paper-ink-3)]">Platform</span>}</td>}
                <td className="py-[11px]">{FEATURE_LABEL[r.feature] ?? r.feature}</td>
                <td className="py-[11px] text-right tabular-nums">{r.calls.toLocaleString()}</td>
                <td className="py-[11px] text-right tabular-nums">{r.inputTokens.toLocaleString()}</td>
                <td className="py-[11px] text-right tabular-nums">{r.outputTokens.toLocaleString()}</td>
                <td className="py-[11px] text-right tabular-nums">{cents(r.costMicros).toFixed(3)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[color:var(--paper-ink)] font-semibold">
              {showOrg && <td className="py-[11px]">Total</td>}
              <td className="py-[11px]">{showOrg ? '' : 'Total'}</td>
              <td className="py-[11px] text-right tabular-nums">{total.calls.toLocaleString()}</td>
              <td className="py-[11px] text-right tabular-nums">{total.inputTokens.toLocaleString()}</td>
              <td className="py-[11px] text-right tabular-nums">{total.outputTokens.toLocaleString()}</td>
              <td className="py-[11px] text-right tabular-nums">{cents(total.costMicros).toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
