/**
 * Developer Tools Page - REDIRECTS to /admin/shopify/config
 * ============================================================================
 * This page has been moved to /admin/shopify/config as part of the Shopify
 * sub-app consolidation. This redirect ensures old bookmarks still work.
 */

import { redirect } from 'next/navigation'

export default function DeveloperPage() {
  redirect('/admin/shopify/config')
}
