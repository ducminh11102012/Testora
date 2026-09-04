import { Branding } from '@/types/db';
import { DEFAULT_BRANDING } from './defaults';

export { DEFAULT_BRANDING };

/** The CSS custom properties every surface reads. */
export function brandVars(b: Branding): Record<string, string> {
  return {
    '--brand': b.primary,
    '--brand-dark': b.primaryDark,
    '--brand-accent': b.accent,
    '--banner': b.banner,
    '--rail': b.rail,
    '--rail-track': b.railTrack,
  };
}

/**
 * The variables go into a `<style>` block, so a value that is not a colour must
 * not survive: `#123;} body{display:none` would otherwise become CSS of its own.
 */
const SAFE_VALUE = /^#[0-9a-f]{3,8}$|^rgba?\([\d.,\s%]+\)$|^[a-z]{3,20}$/i;

export function brandStyleString(b: Branding): string {
  return Object.entries(brandVars(b))
    .filter(([, v]) => SAFE_VALUE.test(String(v).trim()))
    .map(([k, v]) => `${k}:${String(v).trim()}`)
    .join(';');
}

/** Readable text colour for a solid brand-coloured surface. */
export function onBrand(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? '#111111' : '#FFFFFF';
}

export const PRESET_PALETTES: { name: string; primary: string; primaryDark: string; accent: string }[] = [
  { name: 'Indigo', primary: '#1F4FD8', primaryDark: '#173CA6', accent: '#0F9D77' },
  { name: 'Teal', primary: '#0E7C86', primaryDark: '#0A5C63', accent: '#C2410C' },
  { name: 'Plum', primary: '#7A2E6B', primaryDark: '#5C2251', accent: '#1F7A5A' },
  { name: 'Slate', primary: '#334155', primaryDark: '#1E293B', accent: '#B45309' },
  { name: 'Crimson', primary: '#B01030', primaryDark: '#8A0C25', accent: '#0F6E8C' },
  { name: 'Forest', primary: '#1B6B3A', primaryDark: '#14512C', accent: '#9A3412' },
];
