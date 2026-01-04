#!/bin/bash
set -euo pipefail

DEST="/Users/danielplant/myorderhub/05_myorderhub-v2/src"

mkdir -p "$DEST/app/api/auth/[...nextauth]"
mkdir -p "$DEST/app/api/orders" "$DEST/app/api/orders/[id]" "$DEST/app/api/orders/[id]/comments" "$DEST/app/api/orders/export"
mkdir -p "$DEST/app/api/shopify/transfer" "$DEST/app/api/shopify/sync"
mkdir -p "$DEST/app/api/skus" "$DEST/app/api/skus/[id]"
mkdir -p "$DEST/app/api/categories" "$DEST/app/api/categories/[id]"
mkdir -p "$DEST/app/api/customers" "$DEST/app/api/customers/[id]" "$DEST/app/api/customers/import"
mkdir -p "$DEST/app/api/reps" "$DEST/app/api/reps/[id]"
mkdir -p "$DEST/app/api/reports/totals" "$DEST/app/api/reports/po-sold"

mkdir -p "$DEST/app/actions"
mkdir -p "$DEST/app/(auth)/login" "$DEST/app/(auth)/reset-password"
mkdir -p "$DEST/app/(buyer)/pre-order/[collection]" "$DEST/app/(buyer)/my-order" "$DEST/app/(buyer)/confirmation/[id]"
mkdir -p "$DEST/app/(rep)/orders/[id]"

mkdir -p "$DEST/lib/auth"
mkdir -p "$DEST/lib/data/mappers" "$DEST/lib/data/queries"
mkdir -p "$DEST/lib/shopify"
mkdir -p "$DEST/lib/export"

# middleware
cat > "$DEST/middleware.ts" << 'EOF'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// TODO (Stage 2): auth protection for /admin/* and /rep/*
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*', '/rep/:path*'] }
EOF

# auth route placeholder (will be replaced in Stage 2)
cat > "$DEST/app/api/auth/[...nextauth]/route.ts" << 'EOF'
export async function GET() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
export async function POST() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
EOF

# minimal API placeholders
for f in \
  "$DEST/app/api/orders/route.ts" \
  "$DEST/app/api/orders/[id]/route.ts" \
  "$DEST/app/api/orders/[id]/comments/route.ts" \
  "$DEST/app/api/orders/export/route.ts" \
  "$DEST/app/api/shopify/transfer/route.ts" \
  "$DEST/app/api/shopify/sync/route.ts" \
  "$DEST/app/api/skus/route.ts" \
  "$DEST/app/api/skus/[id]/route.ts" \
  "$DEST/app/api/categories/route.ts" \
  "$DEST/app/api/categories/[id]/route.ts" \
  "$DEST/app/api/customers/route.ts" \
  "$DEST/app/api/customers/[id]/route.ts" \
  "$DEST/app/api/customers/import/route.ts" \
  "$DEST/app/api/reps/route.ts" \
  "$DEST/app/api/reps/[id]/route.ts" \
  "$DEST/app/api/reports/totals/route.ts" \
  "$DEST/app/api/reports/po-sold/route.ts"
do
  cat > "$f" << 'EOF'
export async function GET() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
export async function POST() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
export async function PATCH() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
export async function DELETE() {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
EOF
done

# server action placeholders
cat > "$DEST/app/actions/auth.ts" << 'EOF'
'use server'
export async function signIn() { throw new Error('Not implemented') }
export async function signOut() { throw new Error('Not implemented') }
EOF

cat > "$DEST/app/actions/orders.ts" << 'EOF'
'use server'
export async function createOrder() { throw new Error('Not implemented') }
export async function updateOrder() { throw new Error('Not implemented') }
export async function getOrders() { throw new Error('Not implemented') }
EOF

# auth pages
cat > "$DEST/app/(auth)/login/page.tsx" << 'EOF'
export default function LoginPage() {
  return <div className="p-8">Login (stub)</div>
}
EOF

cat > "$DEST/app/(auth)/reset-password/page.tsx" << 'EOF'
export default function ResetPasswordPage() {
  return <div className="p-8">Reset password (stub)</div>
}
EOF

# buyer pages not yet created
cat > "$DEST/app/(buyer)/pre-order/page.tsx" << 'EOF'
export default function PreOrderPage() {
  return <div className="p-8">Pre-order (stub)</div>
}
EOF

cat > "$DEST/app/(buyer)/pre-order/[collection]/page.tsx" << 'EOF'
export default function PreOrderCollectionPage() {
  return <div className="p-8">Pre-order collection (stub)</div>
}
EOF

cat > "$DEST/app/(buyer)/my-order/page.tsx" << 'EOF'
export default function MyOrderPage() {
  return <div className="p-8">My order / checkout (stub)</div>
}
EOF

cat > "$DEST/app/(buyer)/confirmation/[id]/page.tsx" << 'EOF'
export default function ConfirmationPage() {
  return <div className="p-8">Confirmation (stub)</div>
}
EOF

# rep pages
cat > "$DEST/app/(rep)/layout.tsx" << 'EOF'
export default function RepLayout({ children }: { children: React.ReactNode }) {
  return <div className="p-8">Rep layout (stub){children}</div>
}
EOF

cat > "$DEST/app/(rep)/page.tsx" << 'EOF'
export default function RepDashboardPage() {
  return <div className="p-8">Rep dashboard (stub)</div>
}
EOF

cat > "$DEST/app/(rep)/orders/page.tsx" << 'EOF'
export default function RepOrdersPage() {
  return <div className="p-8">Rep orders (stub)</div>
}
EOF

cat > "$DEST/app/(rep)/orders/[id]/page.tsx" << 'EOF'
export default function RepOrderDetailPage() {
  return <div className="p-8">Rep order detail (stub)</div>
}
EOF

# lib stubs
cat > "$DEST/lib/auth/config.ts" << 'EOF'
export const handlers = {
  GET: async () => Response.json({ error: 'Not implemented' }, { status: 501 }),
  POST: async () => Response.json({ error: 'Not implemented' }, { status: 501 }),
}
EOF

cat > "$DEST/lib/auth/providers.ts" << 'EOF'
// Stage 2 will implement Credentials provider here.
EOF

echo "✅ Stubs created"
