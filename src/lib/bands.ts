/**
 * Raw-score → band conversion. These are the widely published indicative
 * tables; they are configurable per test in the admin console because official
 * boundaries move slightly between papers.
 */

export type BandTable = Array<{ min: number; band: number }>;

export const ACADEMIC_READING: BandTable = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 33, band: 7.5 }, { min: 30, band: 7 }, { min: 27, band: 6.5 },
  { min: 23, band: 6 }, { min: 19, band: 5.5 }, { min: 15, band: 5 },
  { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 0 },
];

export const GENERAL_READING: BandTable = [
  { min: 40, band: 9 }, { min: 39, band: 8.5 }, { min: 37, band: 8 },
  { min: 36, band: 7.5 }, { min: 34, band: 7 }, { min: 32, band: 6.5 },
  { min: 30, band: 6 }, { min: 27, band: 5.5 }, { min: 23, band: 5 },
  { min: 19, band: 4.5 }, { min: 15, band: 4 }, { min: 12, band: 3.5 },
  { min: 9, band: 3 }, { min: 6, band: 2.5 }, { min: 0, band: 0 },
];

export const LISTENING: BandTable = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 32, band: 7.5 }, { min: 30, band: 7 }, { min: 26, band: 6.5 },
  { min: 23, band: 6 }, { min: 18, band: 5.5 }, { min: 16, band: 5 },
  { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 0 },
];

export function tableFor(module: string, variant?: string): BandTable {
  if (module === 'listening') return LISTENING;
  if (module === 'reading') return variant === 'general' ? GENERAL_READING : ACADEMIC_READING;
  return ACADEMIC_READING;
}

export function rawToBand(raw: number, table: BandTable): number {
  for (const row of table) if (raw >= row.min) return row.band;
  return 0;
}

/** IELTS rounds an overall to the nearest half band (.25 → up to .5, .75 → up). */
export function roundBand(value: number): number {
  const floor = Math.floor(value);
  const frac = value - floor;
  if (frac < 0.25) return floor;
  if (frac < 0.75) return floor + 0.5;
  return floor + 1;
}
