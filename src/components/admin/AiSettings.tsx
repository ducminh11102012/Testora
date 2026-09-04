'use client';

import { useState } from 'react';
import {
  MODEL_CHOICES, VISION_MODEL_CHOICES, DEFAULT_PRICES, CUSTOM_PRESETS, DEFAULT_BASE_URL, ROLE_HINT,
} from '@/lib/ai/models';

type Public = {
  provider: string; model: string; parsingEnabled: boolean; writingMarkingEnabled: boolean;
  transformJudgingEnabled: boolean; monthlyBudgetCents: number; maxOutputTokens: number;
  streaming?: boolean; markingGuidance: string;
  price: { inputCentsPerMTok: number; outputCentsPerMTok: number };
  apiKeyMasked: string; configured: boolean; hasKey?: boolean;
  baseUrl: string; wire: string; authStyle: string; extraHeaders: Record<string, string>;
  resolvedEndpoint?: string;
};

type Settings = { unified: boolean; parse: Public; mark: Public; vision: Public };
type Role = 'parse' | 'mark' | 'vision';

/** Headers are edited as `Name: value` lines, which is how people read them. */
function headerLines(headers: Record<string, string>): string {
  return Object.entries(headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (name && value) out[name] = value;
  }
  return out;
}

export default function AiSettings({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [switching, setSwitching] = useState(false);

  async function toggleUnified(unified: boolean) {
    setSwitching(true);
    const res = await fetch('/api/platform/ai', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unified }),
    });
    setSwitching(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.settings) setSettings(data.settings);
  }


  return (
    <div className="max-w-[860px] space-y-[26px]">
      {/* ---------------------- one provider, or two ---------------------- */}
      <section className="border border-[color:var(--line)] rounded-[6px] p-[22px]">
        <h2 className="text-[20px] font-semibold mb-[6px]">How many providers</h2>
        <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[16px] max-w-[70ch]">
          Reading a paper, marking one, and reading a photograph of one ask different things of a
          model. Keep them apart to use something cheap and fast for imports, something careful for
          marking, and a model that can see for scans — or run everything from one provider.
        </p>
        <div className="flex flex-wrap gap-[10px]">
          <button
            type="button"
            disabled={switching}
            onClick={() => toggleUnified(true)}
            className={`px-[18px] h-[46px] rounded-[4px] text-[16px] border-2 disabled:opacity-60 ${
              settings.unified ? 'border-black font-semibold' : 'border-[color:var(--line-strong)]'
            }`}
          >
            One AI for every job
          </button>
          <button
            type="button"
            disabled={switching}
            onClick={() => toggleUnified(false)}
            className={`px-[18px] h-[46px] rounded-[4px] text-[16px] border-2 disabled:opacity-60 ${
              !settings.unified ? 'border-black font-semibold' : 'border-[color:var(--line-strong)]'
            }`}
          >
            A separate AI for each job
          </button>
        </div>
        <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[12px]">
          {settings.unified
            ? 'Splitting them copies this provider into both, so nothing stops working while you change one.'
            : 'Merging them keeps the parsing provider and drops the marking one.'}
        </p>
      </section>

      {settings.unified ? (
        <ProviderCard
          role="parse"
          title="AI provider"
          hint="Used for every job: reading uploaded papers, reading photographs and scans, writing a missing answer key, marking writing, and judging sentence transformations."
          config={settings.parse}
          showParsing
          showMarking
          onSaved={setSettings}
        />
      ) : (
        <>
          <ProviderCard
            role="parse"
            title="Reading papers"
            hint={ROLE_HINT.parse}
            config={settings.parse}
            showParsing
            onSaved={setSettings}
          />
          <ProviderCard
            role="mark"
            title="Marking"
            hint={ROLE_HINT.mark}
            config={settings.mark}
            showMarking
            onSaved={setSettings}
          />
          <ProviderCard
            role="vision"
            title="Reading photographs and scans"
            hint={ROLE_HINT.vision}
            config={settings.vision}
            vision
            onSaved={setSettings}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One provider                                                        */
/* ------------------------------------------------------------------ */

function ProviderCard({
  role, title, hint, config: initial, showParsing = false, showMarking = false, vision = false, onSaved,
}: {
  role: Role;
  title: string;
  hint: string;
  config: Public;
  showParsing?: boolean;
  showMarking?: boolean;
  /** A vision slot only offers models that accept images. */
  vision?: boolean;
  onSaved: (next: Settings) => void;
}) {
  const [form, setForm] = useState<Public>(initial);
  const [apiKey, setApiKey] = useState('');
  const [headers, setHeaders] = useState(headerLines(initial.extraHeaders ?? {}));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);

  const set = (patch: Partial<Public>) => setForm((f) => ({ ...f, ...patch }));
  const table = vision ? VISION_MODEL_CHOICES : MODEL_CHOICES;
  const models = table[form.provider as keyof typeof table] ?? [];
  const custom = form.provider === 'custom';

  async function save() {
    setBusy(true); setMessage(null); setTest(null);
    const res = await fetch('/api/platform/ai', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        role,
        extraHeaders: parseHeaderLines(headers),
        ...(apiKey ? { apiKey } : {}),
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? 'Could not save.'); return; }
    const saved: Public = data.settings.unified ? data.settings.parse : data.settings[role];
    setForm(saved);
    setHeaders(headerLines(saved.extraHeaders ?? {}));
    setApiKey('');
    setMessage('Saved.');
    onSaved(data.settings);
  }

  async function runTest() {
    setBusy(true); setTest(null);
    const res = await fetch('/api/platform/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setTest(res.ok && data.ok
      ? `Connected to ${data.model} at ${data.endpoint}. The test call used ${data.tokens} tokens.`
      : `Failed: ${data.error ?? 'no response'}`);
  }

  return (
    <section className="border border-[color:var(--line)] rounded-[6px] p-[22px]">
      <h2 className="text-[20px] font-semibold mb-[4px]">{title}</h2>
      <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[18px] max-w-[72ch]">{hint}</p>

      <div className="grid gap-[14px] sm:grid-cols-2">
        <label className="block">
          <span className="block text-[14px] font-semibold mb-[6px]">Provider</span>
          <select
            className="admin-input"
            value={form.provider}
            onChange={(e) => {
              const provider = e.target.value;
              if (provider === 'custom') { set({ provider }); return; }
              const first = table[provider as keyof typeof table]?.[0] ?? '';
              set({ provider, model: first, price: DEFAULT_PRICES[first] ?? form.price, baseUrl: '' });
            }}
          >
            <option value="none">
              Off{vision ? ' — photographs and scans cannot be imported' : showParsing && !showMarking ? ' — rule-based parsing only' : ''}
            </option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google (Gemini)</option>
            <option value="custom">Custom endpoint — your own URL, key and model</option>
          </select>
        </label>

        {custom ? (
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Model name</span>
            <input
              className="admin-input font-mono"
              placeholder="e.g. deepseek-chat, qwen2.5:14b-instruct, gpt-4o-mini"
              value={form.model}
              onChange={(e) => set({ model: e.target.value })}
            />
            <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[6px]">
              Written exactly as your endpoint expects it — nothing is validated against a list.
            </span>
          </label>
        ) : (
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Model</span>
            <select className="admin-input" value={form.model} disabled={!models.length}
                    onChange={(e) => set({ model: e.target.value, price: DEFAULT_PRICES[e.target.value] ?? form.price })}>
              {models.length === 0 && <option value="">—</option>}
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}

        {custom && (
          <>
            <label className="block sm:col-span-2">
              <span className="block text-[14px] font-semibold mb-[6px]">Endpoint URL</span>
              <input
                className="admin-input font-mono"
                placeholder="https://api.your-provider.com/v1"
                value={form.baseUrl}
                onChange={(e) => set({ baseUrl: e.target.value })}
              />
              <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[6px]">
                The base URL, without <code>/chat/completions</code> — that is added for you. A server
                on this machine (<code>http://127.0.0.1:11434/v1</code>) works too, and then nothing
                leaves your infrastructure.
              </span>
            </label>

            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">API format</span>
              <select className="admin-input" value={form.wire} onChange={(e) => set({ wire: e.target.value })}>
                <option value="openai">OpenAI-compatible (most gateways and local servers)</option>
                <option value="anthropic">Anthropic messages</option>
                <option value="google">Google generateContent</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Send the key as</span>
              <select className="admin-input" value={form.authStyle} onChange={(e) => set({ authStyle: e.target.value })}>
                <option value="bearer">Authorization: Bearer …</option>
                <option value="x-api-key">x-api-key header</option>
                <option value="api-key">api-key header (Azure OpenAI)</option>
                <option value="query">?key=… in the URL</option>
                <option value="none">No key — the endpoint is open to this server</option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-[14px] font-semibold mb-[6px]">Extra headers (optional)</span>
              <textarea
                className="admin-input font-mono h-[80px]"
                placeholder={'HTTP-Referer: https://your-school.edu\nX-Title: Testora'}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
              />
              <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[6px]">
                One <code>Name: value</code> per line. Authorization and content-type are set by the
                platform and cannot be overridden here.
              </span>
            </label>

            <div className="sm:col-span-2">
              <span className="block text-[14px] font-semibold mb-[8px]">Start from a known endpoint</span>
              <div className="flex flex-wrap gap-[8px]">
                {CUSTOM_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    title={preset.note}
                    onClick={() => set({
                      baseUrl: preset.baseUrl, wire: preset.wire,
                      authStyle: preset.authStyle, model: preset.model,
                    })}
                    className="px-[12px] h-[38px] border border-[color:var(--line-strong)] rounded-[4px] text-[15px]"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-[color:var(--paper-ink-3)] mt-[8px]">
                A preset only fills the boxes in — check the model name and add your key.
              </p>
            </div>
          </>
        )}

        {!custom && form.provider !== 'none' && (
          <label className="block sm:col-span-2">
            <span className="block text-[14px] font-semibold mb-[6px]">
              Endpoint override <span className="font-normal text-[color:var(--paper-ink-3)]">— optional, for a proxy or gateway</span>
            </span>
            <input
              className="admin-input font-mono"
              placeholder={DEFAULT_BASE_URL[(form.wire || 'openai') as keyof typeof DEFAULT_BASE_URL]}
              value={form.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
            <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[6px]">
              Leave blank to call {form.provider} directly.
            </span>
          </label>
        )}

        {form.provider !== 'none' && (
          <label className="block sm:col-span-2">
            <span className="block text-[14px] font-semibold mb-[6px]">
              API key {form.hasKey && <span className="font-normal text-[color:var(--paper-ink-3)]">— currently {form.apiKeyMasked}</span>}
              {custom && form.authStyle === 'none' && <span className="font-normal text-[color:var(--paper-ink-3)]"> — not needed for this endpoint</span>}
            </span>
            <input
              className="admin-input font-mono"
              type="password"
              autoComplete="off"
              disabled={custom && form.authStyle === 'none'}
              placeholder={form.hasKey ? 'Leave blank to keep the current key' : 'sk-…'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="block text-[13px] text-[color:var(--paper-ink-3)] mt-[6px]">
              Encrypted before it is stored, and never sent back to the browser.
            </span>
          </label>
        )}

        {form.provider !== 'none' && form.resolvedEndpoint && (
          <p className="sm:col-span-2 text-[15px] text-[color:var(--paper-ink-3)]">
            Calls go to <code className="font-mono">{form.resolvedEndpoint}</code>
            {form.model ? <> using <code className="font-mono">{form.model}</code></> : null}.
          </p>
        )}
      </div>

      {/* ------------------------- what it may do ------------------------ */}
      {form.provider !== 'none' && (
        <fieldset className="mt-[22px] border-t border-[color:var(--line)] pt-[18px]">
          <legend className="sr-only">What this provider is allowed to do</legend>
          <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[14px]">
            Everything with an answer key is marked by the algorithm, with no model call.
          </p>
          <div className="space-y-[12px]">
            {showParsing && (
              <Toggle
                label="Read uploaded papers"
                hint="Classifies each task, places the gaps, and writes the answer key when the paper has none."
                checked={form.parsingEnabled}
                onChange={(v) => set({ parsingEnabled: v })}
              />
            )}
            {showMarking && (
              <>
                <Toggle
                  label="Mark extended writing"
                  hint="Essays, letters and reports, against your rubric. A teacher can still override the mark."
                  checked={form.writingMarkingEnabled}
                  onChange={(v) => set({ writingMarkingEnabled: v })}
                />
                <Toggle
                  label="Judge sentence transformations"
                  hint="Only for rewrites the answer key did not already accept. Word limits and the compulsory word stay in code."
                  checked={form.transformJudgingEnabled}
                  onChange={(v) => set({ transformJudgingEnabled: v })}
                />
              </>
            )}
          </div>
        </fieldset>
      )}

      {/* --------------------------- cost ------------------------------- */}
      {form.provider !== 'none' && (
        <div className="mt-[22px] border-t border-[color:var(--line)] pt-[18px]">
          <h3 className="text-[17px] font-semibold mb-[12px]">Cost and limits</h3>
          <div className="grid gap-[14px] sm:grid-cols-3">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Input, US cents / 1M tokens</span>
              <input type="number" min={0} step="1" className="admin-input" value={form.price.inputCentsPerMTok}
                     onChange={(e) => set({ price: { ...form.price, inputCentsPerMTok: Number(e.target.value) } })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Output, US cents / 1M tokens</span>
              <input type="number" min={0} step="1" className="admin-input" value={form.price.outputCentsPerMTok}
                     onChange={(e) => set({ price: { ...form.price, outputCentsPerMTok: Number(e.target.value) } })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Monthly budget, US cents (0 = none)</span>
              <input type="number" min={0} className="admin-input" value={form.monthlyBudgetCents}
                     onChange={(e) => set({ monthlyBudgetCents: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Longest reply, tokens (0 = no limit)</span>
              <input type="number" min={0} step="1000" className="admin-input" value={form.maxOutputTokens ?? 0}
                     onChange={(e) => set({ maxOutputTokens: Number(e.target.value) })} />
            </label>
          </div>
          <label className="flex items-start gap-[10px] text-[15px] mt-[14px]">
            <input type="checkbox" checked={form.streaming !== false} className="mt-[4px]"
                   onChange={(e) => set({ streaming: e.target.checked })} />
            <span>
              <span className="font-semibold">Stream the reply.</span>{' '}
              Lets the import screen show the model working — the stage, the percentage, and the text
              as it arrives. If the endpoint refuses a streamed request, or accepts one and sends
              nothing, the call is made again the plain way on its own; turn this off only for a
              gateway that streams badly rather than not at all.
            </span>
          </label>
          <p className="text-[13px] text-[color:var(--paper-ink-3)] mt-[10px]">
            Leave the reply length at 0 unless your gateway insists on a number. A paper's JSON is
            longer than the paper itself, and a whole book is read one test at a time rather than in
            one enormous reply, so a low ceiling only cuts papers short.
          </p>
          <p className="text-[13px] text-[color:var(--paper-ink-3)] mt-[10px]">
            {custom && 'A custom endpoint has no price list, so set these two to what your provider charges. '}
            Prices are only used to report spend. Every call is recorded against the organisation that
            caused it, so an import by a school shows up under that school.
          </p>
        </div>
      )}

      {/* ---------------------- marker instructions --------------------- */}
      {showMarking && form.provider !== 'none' && (
        <div className="mt-[22px] border-t border-[color:var(--line)] pt-[18px]">
          <h3 className="text-[17px] font-semibold mb-[6px]">Marker instructions</h3>
          <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[12px]">
            Sent in front of every rubric. Keep it about how to mark, not what to say.
          </p>
          <textarea className="admin-input h-[110px]" value={form.markingGuidance}
                    onChange={(e) => set({ markingGuidance: e.target.value })} />
        </div>
      )}

      <div className="flex items-center gap-[14px] flex-wrap mt-[20px]">
        <button type="button" onClick={save} disabled={busy}
                className="px-[22px] h-[46px] text-white rounded-[4px] text-[16px] disabled:opacity-60"
                style={{ background: 'var(--brand)' }}>
          {busy ? 'Working…' : 'Save'}
        </button>
        <button type="button" onClick={runTest} disabled={busy || !form.configured}
                className="px-[20px] h-[46px] border border-[color:var(--line-strong)] rounded-[4px] text-[16px] disabled:opacity-50">
          Test the connection
        </button>
        {message && <span className="text-[16px] text-[color:var(--good)]">{message}</span>}
        {test && <span className={`text-[16px] ${test.startsWith('Failed') ? 'text-[color:var(--bad)]' : 'text-[color:var(--good)]'}`}>{test}</span>}
      </div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-[12px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[5px]" />
      <span>
        <span className="block text-[17px]">{label}</span>
        <span className="block text-[15px] text-[color:var(--paper-ink-3)]">{hint}</span>
      </span>
    </label>
  );
}
