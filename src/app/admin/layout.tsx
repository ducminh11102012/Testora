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
  const mine = memberships.of(user.id);

  const nav = [
    { href: '/admin', label: 'Overview', icon: <HomeIcon size={20} /> },
    { href: '/admin/tests', label: 'Papers', icon: <BookIcon size={20} /> },
    { href: '/admin/import', label: 'Import a paper', icon: <UploadIcon size={20} /> },
    { href: '/admin/sessions', label: 'Sittings', icon: <CalendarIcon size={20} /> },
    { href: '/admin/marking', label: 'Marking', icon: <PenIcon size={20} /> },
    { href: '/admin/attempts', label: 'Attempts', icon: <ChartIcon size={20} /> },
    { href: '/admin/reports', label: 'Reports', icon: <ChartIcon size={20} /> },
    { href: '/admin/people', label: 'People', icon: <UsersIcon size={20} /> },
    ...(canManage(user.role) || user.isPlatformAdmin
      ? [
        { href: '/admin/codes', label: 'Access codes', icon: <KeyIcon size={20} /> },
        { href: '/admin/branding', label: 'Branding', icon: <PenIcon size={20} /> },
      ]
      : []),
  ];

  return (
    <BrandScope branding={branding}>
      <div className="min-h-screen flex">
        <aside className="w-[262px] shrink-0 border-r border-[#e4e4e4] flex flex-col">
          <div className="h-[86px] flex items-center px-[20px] border-b border-[#e4e4e4]">
            <Link href="/admin"><BrandMark branding={branding} size="sm" /></Link>
          </div>

          <div className="px-[14px] py-[14px] border-b border-[#e4e4e4]">
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
                className="flex items-center gap-[12px] px-[20px] py-[10px] text-[16px] hover:bg-[#f4f4f4]"
              >
                <span className="text-[#8a8a8a]">{n.icon}</span>
                {n.label}
              </Link>
            ))}
            {user.isPlatformAdmin && (
              <Link href="/platform" className="flex items-center gap-[12px] px-[20px] py-[10px] text-[16px] hover:bg-[#f4f4f4] mt-[10px] border-t border-[#efefef] pt-[16px]">
                <span className="text-[#8a8a8a]"><KeyIcon size={20} /></span>
                Platform admin
              </Link>
            )}
          </nav>

          <div className="px-[20px] py-[16px] border-t border-[#e4e4e4] text-[15px] text-[#5e5e5e]">
            <div className="mb-[6px] text-[#1e1e1e]">{user.displayName}</div>
            <div className="mb-[10px] capitalize">{user.role}</div>
            <LogoutButton />
          </div>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </BrandScope>
  );
}
