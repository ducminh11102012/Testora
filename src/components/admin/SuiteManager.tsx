'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SuiteItem } from '@/lib/db';
import { SKILL_LABEL } from '@/lib/band-descriptors';
import { DEFAULT_VIDEOS as VIDEOS } from '@/lib/videos';
import { Pill } from '../ui/Shell';
import DeleteButton from './DeleteButton';

const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
const DEFAULT_MINUTES: Record<string, number> = { listening: 30, reading: 60, writing: 60, speaking: 14 };

interface Row {
  id: string; title: string; status: string; visibility: string; priceCredits: number; items: SuiteItem[];
  settings: { allowPractice: boolean; allowSimulation: boolean; practiceMaxMinutes: number };
  folder: string | null;
}

interface Bank {
  total: number;
  bySkill: { listening: number; reading: number; writing: number };
  possible: number;
}

export default function SuiteManager({
  suites, papers, bank,
}: {
  suites: Row[];
  papers: { id: string; title: string; module: string; durationMin: number }[];
  bank: Bank;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const [draw, setDraw] = useState({
    count: 3, titlePrefix: 'Mock exam', visibility: 'private', publish: true, folder: 'Mocks',
  });
  const [form, setForm] = useState({
    title: '', description: '', visibility: 'private', priceCredits: 0, status: 'published',
    allowPractice: true, allowSimulation: true, practiceMaxMinutes: 0, folder: '',
  });
  const [items, setItems] = useState<SuiteItem[]>(
    SKILLS.map((skill) => ({
      skill,
      testId: null,
      durationMin: DEFAULT_MINUTES[skill],
      videoUrl: VIDEOS[skill],
      mode: skill === 'speaking' ? 'offline' : 'online',
    })),
  );
  const [include, setInclude] = useState<string[]>(['listening', 'reading', 'writing']);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/suites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, items: items.filter((i) => include.includes(i.skill)) }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Could not create the test.'); return; }
    setOpen(false);
    router.push(`/admin/suites/${data.id}`);
  }

  /** Builds full tests out of the bank, one paper per skill, drawn at random. */
  async function assemble() {
    setDrawing(true); setDrawError(null); setDrawNote(null);
    const res = await fetch('/api/admin/suites/assemble', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draw),
    });
    const data = await res.json().catch(() => ({}));
    setDrawing(false);
    if (!res.ok) { setDrawError(data.error ?? 'Nothing could be drawn from the bank.'); return; }
    setDrawNote(
      `Built ${data.built.length} full test(s): ${data.built.map((b: { title: string }) => b.title).join(', ')}.`
      + (data.warnings?.length ? ` ${data.warnings.join(' ')}` : ''),
    );
    router.refresh();
  }

  /** The quick switches on each row: publish it, or list it in the catalogue. */
  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/suites/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'That change could not be saved.');
      return;
    }
    setError(null);
    router.refresh();
  }

  const setItem = (skill: string, patch: Partial<SuiteItem>) =>
    setItems((list) => list.map((i) => (i.skill === skill ? { ...i, ...patch } : i)));

  return (
    <div className="px-[34px] py-[34px] max-w-[1200px]">
      <div className="flex items-center justify-between mb-[10px]">
        <h1 className="text-[32px] font-semibold">Full tests</h1>
        <button type="button" onClick={() => setOpen((v) => !v)}
                className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px]"
                style={{ background: 'var(--brand)' }}>
          {open ? 'Cancel' : 'New full test'}
        </button>
      </div>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px] max-w-[74ch]">
        A full test groups one paper per skill into a single sitting. The candidate sees a section list,
        watches the instructions for each section, and gets one score report at the end.
      </p>

      {open && (
        <form onSubmit={create} className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[26px]">
          <div className="grid gap-[14px] sm:grid-cols-2 mb-[20px]">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Name</span>
              <input required className="admin-input" value={form.title} placeholder="IELTS Academic — Practice Test 1"
                     onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Description</span>
              <input className="admin-input" value={form.description}
                     onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Who can see it</span>
              <select className="admin-input" value={form.visibility}
                      onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                <option value="private">This organisation only</option>
                <option value="catalog">Public catalogue</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Folder</span>
              <input className="admin-input" value={form.folder} placeholder="Mocks · Cambridge IELTS 15"
                     onChange={(e) => setForm({ ...form, folder: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Price in credits</span>
              <input type="number" min={0} className="admin-input" value={form.priceCredits}
                     disabled={form.visibility !== 'catalog'}
                     onChange={(e) => setForm({ ...form, priceCredits: Number(e.target.value) })} />
            </label>
          </div>

          <div className="grid gap-[14px] sm:grid-cols-3 mb-[20px]">
            <label className="flex items-start gap-[10px] text-[15px]">
              <input type="checkbox" checked={form.allowSimulation} className="mt-[4px]"
                     onChange={(e) => setForm({ ...form, allowSimulation: e.target.checked })} />
              <span><span className="font-semibold">Simulation.</span> The whole test in order, to the timings, once.</span>
            </label>
            <label className="flex items-start gap-[10px] text-[15px]">
              <input type="checkbox" checked={form.allowPractice} className="mt-[4px]"
                     onChange={(e) => setForm({ ...form, allowPractice: e.target.checked })} />
              <span><span className="font-semibold">Practice.</span> One section at a time, for as long as the candidate likes, and left out of the report.</span>
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Cap on a practice run (0 = none)</span>
              <input type="number" min={0} max={600} className="admin-input" value={form.practiceMaxMinutes}
                     disabled={!form.allowPractice}
                     onChange={(e) => setForm({ ...form, practiceMaxMinutes: Number(e.target.value) })} />
            </label>
          </div>

          <h3 className="text-[18px] font-semibold mb-[12px]">Sections</h3>
          <div className="space-y-[12px]">
            {SKILLS.map((skill) => {
              const item = items.find((i) => i.skill === skill)!;
              const on = include.includes(skill);
              return (
                <div key={skill} className={`border rounded-[4px] p-[14px] ${on ? 'border-[color:var(--line-strong)]' : 'border-[color:var(--line)] opacity-60'}`}>
                  <label className="flex items-center gap-[10px] mb-[10px]">
                    <input type="checkbox" checked={on}
                           onChange={(e) => setInclude((list) => e.target.checked ? [...list, skill] : list.filter((s) => s !== skill))} />
                    <span className="text-[17px] font-semibold">{SKILL_LABEL[skill]}</span>
                  </label>
                  {on && (
                    <div className="grid gap-[10px] sm:grid-cols-4">
                      <label className="block">
                        <span className="block text-[13px] font-semibold mb-[5px]">Sat</span>
                        <select className="admin-input" value={item.mode}
                                onChange={(e) => setItem(skill, { mode: e.target.value as SuiteItem['mode'] })}>
                          <option value="online">On the platform</option>
                          <option value="offline">With an examiner</option>
                        </select>
                      </label>
                      {item.mode === 'online' && (
                        <>
                          <label className="block sm:col-span-2">
                            <span className="block text-[13px] font-semibold mb-[5px]">Paper</span>
                            <select className="admin-input" value={item.testId ?? ''}
                                    onChange={(e) => {
                                      const paper = papers.find((p) => p.id === e.target.value);
                                      setItem(skill, { testId: e.target.value || null, durationMin: paper?.durationMin ?? item.durationMin });
                                    }}>
                              <option value="">Choose a paper…</option>
                              {papers.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.module})</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <span className="block text-[13px] font-semibold mb-[5px]">Minutes</span>
                            <input type="number" min={1} className="admin-input" value={item.durationMin}
                                   onChange={(e) => setItem(skill, { durationMin: Number(e.target.value) })} />
                          </label>
                          <label className="block sm:col-span-4">
                            <span className="block text-[13px] font-semibold mb-[5px]">Instruction video</span>
                            <input className="admin-input font-mono text-[13px]" value={item.videoUrl ?? ''}
                                   onChange={(e) => setItem(skill, { videoUrl: e.target.value })} />
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="mt-[14px] text-[16px] text-[color:var(--bad)]">{error}</p>}
          <button type="submit" disabled={busy}
                  className="mt-[18px] px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                  style={{ background: 'var(--brand)' }}>
            {busy ? 'Creating…' : 'Create full test'}
          </button>
        </form>
      )}

      {/* ------------------------ built from the bank -------------------- */}
      <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] mb-[26px]">
        <h2 className="text-[21px] font-semibold mb-[6px]">Build tests from the bank</h2>
        <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[16px] max-w-[74ch]">
          Your bank holds {bank.total} paper{bank.total === 1 ? '' : 's'} —{' '}
          {bank.bySkill.listening} listening, {bank.bySkill.reading} reading, {bank.bySkill.writing} writing.
          {bank.possible > 0
            ? ` Enough for ${bank.possible} full test${bank.possible === 1 ? '' : 's'} with no paper used twice.`
            : ' Upload a book, or tick “keep this paper in the bank” on a paper, and tests can be built from it.'}
        </p>
        <div className="grid gap-[14px] sm:grid-cols-5 items-end">
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">How many tests</span>
            <input type="number" min={1} max={20} className="admin-input" value={draw.count}
                   onChange={(e) => setDraw({ ...draw, count: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Called</span>
            <input className="admin-input" value={draw.titlePrefix}
                   onChange={(e) => setDraw({ ...draw, titlePrefix: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Filed under</span>
            <input className="admin-input" value={draw.folder}
                   onChange={(e) => setDraw({ ...draw, folder: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Who can see them</span>
            <select className="admin-input" value={draw.visibility}
                    onChange={(e) => setDraw({ ...draw, visibility: e.target.value })}>
              <option value="private">This organisation only</option>
              <option value="catalog">Public catalogue</option>
            </select>
          </label>
          <button type="button" onClick={assemble} disabled={drawing || bank.total === 0}
                  className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                  style={{ background: 'var(--brand)' }}>
            {drawing ? 'Drawing…' : 'Draw from the bank'}
          </button>
        </div>
        <label className="flex items-center gap-[10px] text-[15px] mt-[14px]">
          <input type="checkbox" checked={draw.publish}
                 onChange={(e) => setDraw({ ...draw, publish: e.target.checked })} />
          <span>Put them in front of candidates straight away</span>
        </label>
        {drawError && <p className="mt-[12px] text-[16px] text-[color:var(--bad)]">{drawError}</p>}
        {drawNote && <p className="mt-[12px] text-[16px] text-[color:var(--good)]">{drawNote}</p>}
      </section>

      {suites.length === 0 ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">No full tests yet.</p>
      ) : (
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[color:var(--line)]">
              <th className="py-[10px] font-semibold">Name</th>
              <th className="py-[10px] font-semibold w-[300px]">Sections</th>
              <th className="py-[10px] font-semibold w-[130px]">Status</th>
              <th className="py-[10px] font-semibold w-[150px]">Catalogue</th>
              <th className="py-[10px] w-[90px]" />
            </tr>
          </thead>
          <tbody>
            {suites.map((s) => (
              <tr key={s.id} className="border-b border-[color:var(--line)]">
                <td className="py-[12px]">
                  <Link href={`/admin/suites/${s.id}`} className="underline">{s.title}</Link>
                  {s.folder && (
                    <span className="block text-[14px] text-[color:var(--paper-ink-3)]">{s.folder}</span>
                  )}
                </td>
                <td className="py-[12px] text-[15px] text-[color:var(--paper-ink-3)]">
                  {s.items.map((i) => `${SKILL_LABEL[i.skill]}${i.mode === 'offline' ? ' (examiner)' : ''}`).join(' · ')}
                </td>
                <td className="py-[12px]">
                  <Pill tone={s.status === 'published' ? 'good' : 'neutral'}>{s.status}</Pill>
                  <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[4px]">
                    {[s.settings.allowSimulation && 'simulation', s.settings.allowPractice && 'practice']
                      .filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td className="py-[12px]">
                  {s.visibility === 'catalog'
                    ? <Pill tone="brand">{s.priceCredits === 0 ? 'Free' : `${s.priceCredits} credits`}</Pill>
                    : <span className="text-[color:var(--paper-ink-3)]">Private</span>}
                </td>
                <td className="py-[12px] text-right space-x-[14px] whitespace-nowrap">
                  <button type="button" className="underline"
                          onClick={() => patch(s.id, { status: s.status === 'published' ? 'draft' : 'published' })}>
                    {s.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button type="button" className="underline"
                          onClick={() => patch(s.id, { visibility: s.visibility === 'catalog' ? 'private' : 'catalog' })}>
                    {s.visibility === 'catalog' ? 'Take out of catalogue' : 'To catalogue'}
                  </button>
                  <Link href={`/suite/${s.id}`} className="underline">Preview</Link>
                  <DeleteButton url={`/api/admin/suites/${s.id}`} what={`the full test “${s.title}”`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
