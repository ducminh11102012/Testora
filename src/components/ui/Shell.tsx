import Link from 'next/link';
import { Branding } from '@/types/db';
import BrandMark from './BrandMark';
import LogoutButton from '../LogoutButton';

/** The header used by every non-exam page. */
export default function PageHeader({
  branding, right, subtitle, href = '/',
}: {
  branding: Branding;
  right?: React.ReactNode;
  subtitle?: string;
  href?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-[20px] px-[28px] h-[76px] border-b border-[color:var(--line)]">
      <Link href={href} className="flex items-center gap-[16px]" aria-label={branding.wordmark}>
        <BrandMark branding={branding} size="sm" tone="brand" />
        {subtitle && <span className="hidden sm:inline text-[16px] text-[color:var(--paper-ink-3)] border-l border-[color:var(--line)] pl-[16px]">{subtitle}</span>}
      </Link>
      <div className="flex items-center gap-[18px] text-[16px]">{right}</div>
    </header>
  );
}

export function SignOut() { return <LogoutButton />; }

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-card ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="p-card px-[18px] py-[16px]">
      <div className="p-display text-[32px] leading-none mb-[8px] tabular-nums">{value}</div>
      <div className="text-[14px] text-[color:var(--paper-ink-3)]">{label}</div>
      {hint && <div className="text-[13px] text-[color:var(--paper-ink-3)] mt-[4px]">{hint}</div>}
    </div>
  );
}

export function Pill({ tone = 'neutral', children }: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand'; children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    neutral: 'bg-[color:var(--paper-sunk)] text-[color:var(--paper-ink-2)]',
    good: 'bg-[#E7EFE2] text-[#2F5A28]',
    warn: 'bg-[#F6EBD2] text-[#7A5A12]',
    bad: 'bg-[#F4E2E2] text-[#8E2727]',
    brand: 'text-[color:var(--paper-raised)]',
  };
  return (
    <span
      className={`inline-block px-[10px] py-[3px] rounded-full text-[13px] font-semibold ${styles[tone]}`}
      style={tone === 'brand' ? { background: 'var(--brand)' } : undefined}
    >
      {children}
    </span>
  );
}
