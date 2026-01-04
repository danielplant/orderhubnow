import { auth } from '@/lib/auth/providers'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const role = req.auth?.user?.role

  // Route classification
  const isAdminRoute = pathname.startsWith('/admin')
  const isRepRoute = pathname.startsWith('/rep')
  const isAdminLogin = pathname === '/admin/login'
  const isRepLogin = pathname === '/rep/login'

  // Already authenticated user on login pages → redirect to their dashboard
  if (isLoggedIn) {
    if (isAdminLogin) {
      // Authenticated user on /admin/login
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', req.nextUrl.origin))
      } else {
        // Rep on admin login → send to rep dashboard
        return NextResponse.redirect(new URL('/rep', req.nextUrl.origin))
      }
    }
    if (isRepLogin) {
      // Authenticated user on /rep/login
      if (role === 'rep') {
        return NextResponse.redirect(new URL('/rep', req.nextUrl.origin))
      } else {
        // Admin on rep login → send to admin dashboard
        return NextResponse.redirect(new URL('/admin', req.nextUrl.origin))
      }
    }
  }

  // Unauthenticated user on protected routes → redirect to role-specific login
  if (!isLoggedIn) {
    if (isAdminRoute && !isAdminLogin) {
      const loginUrl = new URL('/admin/login', req.nextUrl.origin)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (isRepRoute && !isRepLogin) {
      const loginUrl = new URL('/rep/login', req.nextUrl.origin)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Cross-area access: redirect users to their own dashboard
  if (isLoggedIn) {
    if (isAdminRoute && !isAdminLogin && role === 'rep') {
      // Rep trying to access admin area → redirect to rep dashboard
      return NextResponse.redirect(new URL('/rep', req.nextUrl.origin))
    }
    if (isRepRoute && !isRepLogin && role === 'admin') {
      // Admin trying to access rep area → redirect to admin dashboard
      return NextResponse.redirect(new URL('/admin', req.nextUrl.origin))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/rep/:path*'],
}
