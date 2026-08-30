export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function countWords(text: string): number {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  return t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** A → 0, B → 1 … ; also handles roman numerals i, ii, iii … */
export function labelToIndex(label: string): number {
  const l = label.trim().toLowerCase();
  const roman: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
    xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15,
  };
  if (roman[l] !== undefined) return roman[l] - 1;
  if (/^[a-z]$/.test(l)) return l.charCodeAt(0) - 97;
  return -1;
}

export function indexToLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv','xvi','xvii','xviii','xix','xx'];
export function indexToRoman(i: number): string {
  return ROMAN[i] ?? String(i + 1);
}
