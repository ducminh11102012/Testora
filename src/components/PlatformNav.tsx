import Link from 'next/link';

const LINKS = [
  { href: '/platform', label: 'Organisations' },
  { href: '/platform/applications', label: 'Applications' },
  { href: '/platform/ai', label: 'AI settings' },
  { href: '/platform/sign-in', label: 'Sign-in' },
  { href: '/platform/email', label: 'Email' },
  { href: '/platform/storage', label: 'Storage' },
  { href: '/platform/usage', label: 'AI usage' },
];

export default function PlatformNav({ current, pending = 0 }: { current: string; pending?: number }) {
  return (
    <nav className="flex gap-[6px] border-b border-[color:var(--line)] mb-[30px] flex-wrap">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-[16px] py-[12px] text-[17px] ${
            current === l.href ? 'font-semibold border-b-2 border-black -mb-px' : 'text-[color:var(--paper-ink-3)]'
          }`}
        >
          {l.label}
          {/* Applications waiting are the one thing worth interrupting for. */}
          {l.href === '/platform/applications' && pending > 0 && (
            <span
              className="ml-[8px] px-[8px] py-[1px] rounded-full text-[14px] text-white align-middle"
              style={{ background: 'var(--bad)' }}
            >
              {pending}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
