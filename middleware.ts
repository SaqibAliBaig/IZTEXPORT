import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  const isPublicPath = path === '/login'

  const authCookie = request.cookies.get('stitchbook_auth')
  const isAuthenticated = authCookie?.value === 'authenticated'

  if (isPublicPath && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!isPublicPath && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)'],
}