import Link from 'next/link';
import { requireStaff } from '@/lib/context';
import { memberships } from '@/lib/db';
import { canManage } from '@/lib/auth';
import BrandScope from '@/components/BrandScope';
import BrandMark from '@/components/ui/BrandMark';
import LogoutButton from '@/components/LogoutButton';
import OrgSwitcher from '@/components/admin/OrgSwitcher';
import {
  BookIcon, CalendarIcon, ChartIcon, HomeIcon, KeyIcon, PenIcon, UploadIcon, UsersIcon,
} from '@/components/ui/Icons';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, org, branding } = await requireStaff();
  const mine = await memberships.of(user.id);

  const nav = [
    { href: '/admin', label: 'Overview', icon: <HomeIcon size={20} /> },
    { href: '/admin/tests', label: 'Papers', icon: <BookIcon size={20} /> },
    { href: '/admin/bank', label: 'Bank', icon: <BookIcon size={20} /> },
    { href: '/admin/suites', label: 'Full tests', icon: <BookIcon size={20} /> },
    { href: '/admin/import', label: 'Import a paper', icon: <UploadIcon size={20} /> },
    { href: '/admin/library', label: 'Testora library', icon: <BookIcon size={20} /> },
    { href: '/admin/sessions', label: 'Sittings', icon: <CalendarIcon size={20} /> },
    { href: '/admin/marking', label: 'Marking', icon: <PenIcon size={20} /> },
    { href: '/admin/attempts', label: 'Attempts', icon: <ChartIcon size={20} /> },
    { href: '/admin/reports', label: 'Reports', icon: <ChartIcon size={20} /> },
    { href: '/admin/people', label: 'People', icon: <UsersIcon size={20} /> },
    ...(canManage(user.role) || user.isPlatformAdmin
      ? [
        { href: '/admin/codes', label: 'Access codes', icon: <KeyIcon size={20} /> },
        { href: '/admin/branding', label: 'Branding', icon: <PenIcon size={20} /> },
        { href: '/admin/ai-usage', label: 'AI usage', icon: <ChartIcon size={20} /> },
        { href: '/admin/storage', label: 'Storage', icon: <UploadIcon size={20} /> },
      ]
      : []),
  ];

  return (
    <BrandScope branding={branding}>
      <div className="min-h-screen flex">
        <aside className="w-[258px] shrink-0 border-r border-[color:var(--line)] bg-[color:var(--paper-sunk)] flex flex-col">
          <div className="h-[76px] flex items-center px-[20px] border-b border-[color:var(--line)]">
            <Link href="/admin"><BrandMark branding={branding} size="sm" tone="brand" /></Link>
          </div>

          <div className="px-[14px] py-[14px] border-b border-[color:var(--line)]">
            <OrgSwitcher
              current={{ id: org.id, name: org.name, kind: org.kind }}
              options={mine.map((m) => ({ id: m.orgId, name: m.orgName, role: m.role }))}
              isPlatformAdmin={user.isPlatformAdmin}
            />
          </div>

          <nav className="flex-1 py-[10px] overflow-y-auto">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                /*
                 * No prefetching in this console. Next keeps a prefetched page
                 * in the client router cache, so clicking "Bank" while a book
                 * was being imported showed the copy fetched *before* the
                 * papers existed — an empty bank, next to a papers list that
                 * said the papers were in it.
                 */
                prefetch={false}
                className="flex items-center gap-[12px] px-[20px] py-[9px] text-[15px]
                           text-[color:var(--paper-ink-2)] hover:text-[color:var(--paper-ink)]
                           hover:bg-[color:var(--paper-raised)]"
              >
                <span className="text-[color:var(--paper-ink-3)]">{n.icon}</span>
                {n.label}
              </Link>
            ))}
            {user.isPlatformAdmin && (
              <Link
                href="/platform"
                className="flex items-center gap-[12px] px-[20px] py-[9px] text-[15px]
                           text-[color:var(--paper-ink-2)] hover:text-[color:var(--paper-ink)]
                           hover:bg-[color:var(--paper-raised)] mt-[10px] border-t border-[color:var(--line)] pt-[16px]"
              >
                <span className="text-[color:var(--paper-ink-3)]"><KeyIcon size={20} /></span>
                Platform admin
              </Link>
            )}
          </nav>

          <div className="px-[20px] py-[16px] border-t border-[color:var(--line)] text-[15px] text-[color:var(--paper-ink-3)]">
            <div className="mb-[6px] text-[color:var(--paper-ink)]">{user.displayName}</div>
            <div className="mb-[10px] capitalize">{user.role}</div>
            <LogoutButton />
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-[color:var(--paper)]">{children}</main>
      </div>
    </BrandScope>
  );
}
