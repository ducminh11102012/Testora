import { Branding } from '@/types/db';

/**
 * The platform mark: an answer sheet with a completed row. Organisations may
 * replace it with their own image, in which case the wordmark is hidden.
 */
export function BrandGlyph({ size = 34, color = 'var(--brand)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="27" height="27" rx="7" stroke={color} strokeWidth="2.6" />
      <path d="M9 12h8" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 19h4" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16.5 20.5 19.5 23.5 25 16" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BrandMark({
  branding, size = 'md', showTagline = false,
}: {
  branding: Branding;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}) {
  const scale = size === 'lg' ? 1.45 : size === 'sm' ? 0.78 : 1;
  const glyph = Math.round(34 * scale);
  const type = Math.round(26 * scale);

  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoUrl}
        alt={branding.wordmark}
        style={{ height: Math.round(40 * scale), width: 'auto', maxWidth: 260 }}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-[10px]">
      <BrandGlyph size={glyph} />
      <span className="flex flex-col leading-none">
        <span style={{ fontSize: type, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--brand)' }}>
          {branding.wordmark}
        </span>
        {showTagline && branding.tagline && (
          <span style={{ fontSize: Math.round(type * 0.42), marginTop: 4, color: 'var(--muted)' }}>
            {branding.tagline}
          </span>
        )}
      </span>
    </span>
  );
}
