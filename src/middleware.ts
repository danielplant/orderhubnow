import { auth } from '@/lib/auth/providers'
import { NextRequest, NextResponse } from 'next/server'

// Redirect apex domain to www (handles cookie/session domain mismatch)
function wwwRedirect(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host') || ''
  // If accessing apex domain (no www), redirect to www
  if (host === 'orderhubnow.com') {
    const url = req.nextUrl.clone()
    url.host = 'www.orderhubnow.com'
    return NextResponse.redirect(url, 301)
  }
  return null
}

export default auth((req) => {
  // Check for apex domain redirect first
  const wwwResponse = wwwRedirect(req)
  if (wwwResponse) return wwwResponse

  const { pathname, searchParams } = req.nextUrl
  const isLoggedIn = !!req.auth
  const role = req.auth?.user?.role

  // Route classification
  const isAdminRoute = pathname.startsWith('/admin')
  const isRepRoute = pathname.startsWith('/rep')
  const isAdminLogin = pathname === '/admin/login'
  const isRepLogin = pathname === '/rep/login'

  // Login pages now redirect to /login themselves, so we don't need
  // to handle authenticated users on login pages - they'll be redirected
  // by the page component. But keep a quick redirect for efficiency.
  if (isLoggedIn && (isAdminLogin || isRepLogin)) {
    const defaultUrl = role === 'admin' ? '/admin' : '/rep'
    return NextResponse.redirect(new URL(defaultUrl, req.nextUrl.origin))
  }

  // Unauthenticated user on protected routes → redirect to unified login
  if (!isLoggedIn) {
    if (isAdminRoute && !isAdminLogin) {
      const loginUrl = new URL('/login', req.nextUrl.origin)
      loginUrl.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`)
      return NextResponse.redirect(loginUrl)
    }
    if (isRepRoute && !isRepLogin) {
      const loginUrl = new URL('/login', req.nextUrl.origin)
      loginUrl.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`)
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
      // Admin trying to access rep area
      // Allow if adminViewAs param is present (view-as mode)
      const adminViewAs = searchParams.get('adminViewAs')
      if (adminViewAs) {
        // Admin in view-as mode - allow access and pass URL via request header
        // (must use request headers, not response headers, for server-side code to read)
        const requestHeaders = new Headers(req.headers)
        requestHeaders.set('x-url', req.nextUrl.toString())
        return NextResponse.next({ request: { headers: requestHeaders } })
      }
      // Admin without view-as → redirect to admin dashboard
      return NextResponse.redirect(new URL('/admin', req.nextUrl.origin))
    }
  }

  // For rep routes, always pass the URL header for view-as support
  if (isRepRoute && isLoggedIn) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-url', req.nextUrl.toString())
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // For buyer routes, pass URL header for view-as detection in buyer layout
  const isBuyerRoute = pathname.startsWith('/buyer')
  if (isBuyerRoute) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-url', req.nextUrl.toString())
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next()
})

export const config = {
  // Match all paths except static files and api routes that don't need www redirect
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
