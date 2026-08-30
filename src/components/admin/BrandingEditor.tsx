'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Branding, OrgSettings } from '@/types/db';
import { PRESET_PALETTES, brandVars } from '@/lib/brand';
import BrandMark from '../ui/BrandMark';

export default function BrandingEditor({
  orgName, orgSlug, branding, settings,
}: {
  orgName: string; orgSlug: string; branding: Branding; settings: OrgSettings;
}) {
  const router = useRouter();
  const [name, setName] = useState(orgName);
  const [draft, setDraft] = useState<Branding>(branding);
  const [rules, setRules] = useState<OrgSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const set = (patch: Partial<Branding>) => setDraft((d) => ({ ...d, ...patch }));

  async function onLogo(file: File) {
    if (file.size > 300_000) { setMessage('Choose an image under 300 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => set({ logoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true); setMessage(null);
    const res = await fetch('/api/admin/branding', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, branding: draft, settings: rules }),
    });
    setBusy(false);
    if (!res.ok) { setMessage('Could not save.'); return; }
    setMessage('Saved. Candidates will see this on the exam screen.');
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1180px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">Branding</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[28px] max-w-[70ch]">
        This is what candidates see in the exam header, on your landing page at <code>/o/{orgSlug}</code>,
        and on their results.
      </p>

      <div className="grid gap-[24px] lg:grid-cols-[1fr_420px]">
        <div className="space-y-[20px]">
          <Row label="Organisation name">
            <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Wordmark (shown when there is no logo image)">
            <input className="admin-input" value={draft.wordmark} onChange={(e) => set({ wordmark: e.target.value })} />
          </Row>
          <Row label="Tagline">
            <input className="admin-input" value={draft.tagline ?? ''} onChange={(e) => set({ tagline: e.target.value })} />
          </Row>

          <Row label="Logo image (PNG or SVG, under 300 KB)">
            <div className="flex items-center gap-[14px] flex-wrap">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
                className="admin-input pt-[9px]"
              />
              {draft.logoUrl && (
                <button type="button" onClick={() => set({ logoUrl: undefined })} className="underline text-[15px]">
                  Remove logo
                </button>
              )}
            </div>
          </Row>

          <Row label="Palette">
            <div className="flex flex-wrap gap-[10px] mb-[14px]">
              {PRESET_PALETTES.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => set({ primary: p.primary, primaryDark: p.primaryDark, accent: p.accent })}
                  className={`flex items-center gap-[8px] px-[12px] h-[42px] rounded-[4px] border text-[15px] ${
                    draft.primary === p.primary ? 'border-black border-2' : 'border-[#c1c1c1]'
                  }`}
                >
                  <span className="w-[18px] h-[18px] rounded-full" style={{ background: p.primary }} />
                  {p.name}
                </button>
              ))}
            </div>
            <div className="grid gap-[12px] sm:grid-cols-3">
              <ColourField label="Primary" value={draft.primary} onChange={(v) => set({ primary: v })} />
              <ColourField label="Primary (dark)" value={draft.primaryDark} onChange={(v) => set({ primaryDark: v })} />
              <ColourField label="Accent" value={draft.accent} onChange={(v) => set({ accent: v })} />
              <ColourField label="Part banner" value={draft.banner} onChange={(v) => set({ banner: v })} />
              <ColourField label="Timer bar" value={draft.rail} onChange={(v) => set({ rail: v })} />
              <ColourField label="Timer track" value={draft.railTrack} onChange={(v) => set({ railTrack: v })} />
            </div>
          </Row>

          <Row label="Default exam rules for new sittings">
            <div className="grid gap-[8px] sm:grid-cols-2">
              {([
                ['blockCopyPaste', 'Block copy and paste'],
                ['trackFocusLoss', 'Record when candidates leave the window'],
                ['lockPartOnLeave', 'Lock each part once they move on'],
                ['allowSelfSignup', 'Let candidates register themselves'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-[10px] text-[16px]">
                  <input type="checkbox" checked={rules[key]}
                         onChange={(e) => setRules({ ...rules, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </Row>

          <Row label="Credits given to a new self-registered account">
            <input type="number" min={0} className="admin-input max-w-[180px]" value={rules.signupCredits}
                   onChange={(e) => setRules({ ...rules, signupCredits: Number(e.target.value) || 0 })} />
          </Row>

          <div className="flex items-center gap-[16px]">
            <button type="button" onClick={save} disabled={busy}
                    className="px-[22px] h-[48px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                    style={{ background: 'var(--brand)' }}>
              {busy ? 'Saving…' : 'Save branding'}
            </button>
            {message && <span className="text-[16px] text-[color:var(--good)]">{message}</span>}
          </div>
        </div>

        {/* Live preview of the exam header, which is where branding matters most. */}
        <div style={brandVars(draft) as React.CSSProperties}>
          <p className="text-[14px] font-semibold uppercase tracking-wide text-[#8a8a8a] mb-[10px]">Preview</p>
          <div className="border border-[#dcdcdc] rounded-[6px] overflow-hidden">
            <div className="px-[8px] pt-[3px] pb-[2px] bg-white">
              <div className="h-[9px] rounded-full" style={{ background: draft.railTrack }}>
                <div className="h-full rounded-full w-[72%]" style={{ background: draft.rail }} />
              </div>
            </div>
            <div className="flex items-center justify-between px-[16px] h-[72px] border-b border-[#e4e4e4] bg-white">
              <BrandMark branding={draft} size="sm" />
              <span className="text-[14px] font-bold">VN-0043128</span>
            </div>
            <div className="p-[12px] bg-white">
              <div className="px-[16px] py-[12px]" style={{ background: draft.banner }}>
                <p className="text-[14px] font-bold">Part 1</p>
                <p className="text-[14px]">Read the text and answer questions 1–13.</p>
              </div>
            </div>
            <div className="px-[16px] pb-[16px] bg-white">
              <button type="button" className="px-[16px] h-[40px] rounded-[4px] text-white text-[15px]"
                      style={{ background: draft.primary }}>
                Submit answers
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[14px] font-semibold mb-[7px]">{label}</span>
      {children}
    </label>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-[#5e5e5e] mb-[5px]">{label}</span>
      <span className="flex items-center gap-[8px]">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
               className="w-[44px] h-[44px] border border-[#c1c1c1] rounded-[4px] bg-white p-[3px]" aria-label={label} />
        <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}
