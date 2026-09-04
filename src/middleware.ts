import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sessionSecret } from '@/lib/session-secret';

const PROTECTED = ['/dashboard', '/test', '/results', '/suite', '/admin', '/platform', '/billing'];

/**
 * Two jobs. It keeps signed-out visitors out of the protected paths, and it
 * tells the server components which path they are rendering, which is how the
 * first-run and verification gates in the root layout avoid redirect loops.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const pass = () => {
    const res = NextResponse.next();
    res.headers.set('x-pathname', pathname);
    return res;
  };

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return pass();

  const token = req.cookies.get('testora_session')?.value;
  const secret = sessionSecret();

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
    return pass();
  } catch {
    const url = new URL('/login', req.url);
    url.searchParams.set('reason', token ? 'expired' : 'auth');
    return NextResponse.redirect(url);
  }
}

export const config = {
  // Everything except Next's own assets, so `x-pathname` is always set.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4)$).*)'],
};
