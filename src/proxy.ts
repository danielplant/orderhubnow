import { auth } from '@/lib/auth/providers'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const role = req.auth?.user?.role

  // Protected routes
  const isAdminRoute = pathname.startsWith('/admin')
  const isRepRoute = pathname.startsWith('/rep')

  // Redirect to login if not authenticated
  if ((isAdminRoute || isRepRoute) && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based access control
  if (isAdminRoute && role === 'rep') {
    // Rep trying to access admin - redirect to rep dashboard
    return NextResponse.redirect(new URL('/rep', req.nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/rep/:path*'],
}
