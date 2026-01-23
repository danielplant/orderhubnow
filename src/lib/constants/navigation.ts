/**
 * Navigation Constants
 * ============================================================================
 * Sidebar navigation for Admin, Rep, Developer, and Buyer portals.
 * Path: src/lib/constants/navigation.ts
 */

export type NavItem = {
  name: string
  path?: string           // Optional - sections don't have paths
  children?: NavItem[]
  section?: boolean       // True = render as section header (not a link)
  back?: boolean          // True = render as "← Back to X" link
}

export const adminNav: NavItem[] = [
  { name: 'Dashboard', path: '/admin' },
  { name: 'Reports', path: '/admin/reports' },

  { name: 'ORDERS', section: true },
  { name: 'Orders', path: '/admin/orders' },
  { name: 'Open Items', path: '/admin/open-items' },

  { name: 'CATALOG', section: true },
  { name: 'Products', path: '/admin/products' },
  { name: 'Collections', path: '/admin/collections' },
  { name: 'Categories', path: '/admin/categories' },
  { name: 'Inventory', path: '/admin/inventory' },
  { name: 'Prepacks', path: '/admin/prepacks' },

  { name: 'PEOPLE', section: true },
  { name: 'Customers', path: '/admin/customers' },
  { name: 'Reps', path: '/admin/reps' },

  { name: 'SYSTEM', section: true },
  { name: 'Settings', path: '/admin/settings' },
  { name: 'Feature Interest', path: '/admin/feature-interest' },
  { name: 'Developer Portal', path: '/admin/dev' },
]

export const devNav: NavItem[] = [
  { name: 'Back to Admin', path: '/admin', back: true },

  { name: 'SHOPIFY', section: true },
  { name: 'Overview', path: '/admin/dev/shopify' },
  {
    name: 'Sync',
    path: '/admin/dev/shopify/sync',
    children: [
      { name: 'Dashboard', path: '/admin/dev/shopify/sync' },
      { name: 'Setup', path: '/admin/dev/shopify/sync/setup' },
      { name: 'Run', path: '/admin/dev/shopify/sync/run' },
      { name: 'Mappings', path: '/admin/dev/shopify/sync/mappings' },
      { name: 'Schedules', path: '/admin/dev/shopify/sync/schedules' },
      { name: 'History', path: '/admin/dev/shopify/sync/history' },
    ],
  },
  { name: 'Configuration', path: '/admin/dev/shopify/config' },
  { name: 'Sync Settings', path: '/admin/dev/shopify/settings' },
]

export const repNav: NavItem[] = [
  { name: 'Dashboard', path: '/rep' },
  { name: 'Orders', path: '/rep/orders' },
  { name: 'Products', path: '/rep/products' },
]

export const buyerNav: NavItem[] = [
  { name: 'Select Journey', path: '/buyer/select-journey' },
  { name: 'ATS', path: '/buyer/ats' },
  { name: 'Pre-Order', path: '/buyer/pre-order' },
  { name: 'My Order', path: '/buyer/my-order' },
]
