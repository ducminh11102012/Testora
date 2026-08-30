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
    <header className="flex items-center justify-between gap-[20px] px-[28px] h-[86px] border-b border-[#e4e4e4]">
      <Link href={href} className="flex items-center gap-[16px]" aria-label={branding.wordmark}>
        <BrandMark branding={branding} />
        {subtitle && <span className="hidden sm:inline text-[16px] text-[#5e5e5e] border-l border-[#dcdcdc] pl-[16px]">{subtitle}</span>}
      </Link>
      <div className="flex items-center gap-[18px] text-[16px]">{right}</div>
    </header>
  );
}

export function SignOut() { return <LogoutButton />; }

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-[#e3e3e3] rounded-[6px] ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-[#e3e3e3] rounded-[6px] px-[18px] py-[16px]">
      <div className="text-[30px] font-semibold leading-none mb-[6px] tabular-nums">{value}</div>
      <div className="text-[15px] text-[#5e5e5e]">{label}</div>
      {hint && <div className="text-[13px] text-[#8a8a8a] mt-[4px]">{hint}</div>}
    </div>
  );
}

export function Pill({ tone = 'neutral', children }: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand'; children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    neutral: 'bg-[#f1f1f1] text-[#5e5e5e]',
    good: 'bg-[#e2f2e2] text-[#1f6b1f]',
    warn: 'bg-[#FFF6DE] text-[#8a6100]',
    bad: 'bg-[#FDE7EC] text-[#b3123a]',
    brand: 'text-white',
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
