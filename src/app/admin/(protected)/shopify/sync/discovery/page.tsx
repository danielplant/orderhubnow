/**
 * Discovery Page - REDIRECTS to /admin/shopify/discovery
 * ============================================================================
 * This page has been moved to /admin/shopify/discovery as part of the Shopify
 * sub-app consolidation. This redirect ensures old bookmarks still work.
 */

import { redirect } from 'next/navigation'

export default function OldDiscoveryPage() {
  redirect('/admin/shopify/discovery')
}
