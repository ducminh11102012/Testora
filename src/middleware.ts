import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED = ['/dashboard', '/test', '/results', '/admin', '/platform', '/billing'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const token = req.cookies.get('examina_session')?.value;
  const secret = new TextEncoder().encode(
    process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me-please',
  );

  try {
    if (!token) throw new Error('no token');
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role ?? 'candidate');
    const staff = role === 'owner' || role === 'admin' || role === 'teacher';

    if (pathname.startsWith('/admin') && !staff && !payload.isPlatformAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (pathname.startsWith('/platform') && !payload.isPlatformAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  } catch {
    const url = new URL('/login', req.url);
    url.searchParams.set('reason', token ? 'expired' : 'auth');
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/test/:path*', '/results/:path*', '/admin/:path*', '/platform/:path*', '/billing/:path*'],
};
