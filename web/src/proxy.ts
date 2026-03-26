import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  
  if (!userId && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  if (userId && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - uploads (File uploads proxy)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - .*\\.(png|jpg|jpeg|gif|webp|svg)$ (images)
     */
    '/((?!api|uploads|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
}
