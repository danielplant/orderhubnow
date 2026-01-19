/**
 * Navigation Constants
 * ============================================================================
 * Updated to include Reports link.
 * Path: src/lib/constants/navigation.ts
 */

export type NavItem = {
  name: string
  path: string
  children?: NavItem[]
}

export const adminNav: NavItem[] = [
  { name: 'Dashboard', path: '/admin' },
  { name: 'Reports', path: '/admin/reports' },
  { name: 'Orders', path: '/admin/orders' },
  { name: 'Open Items', path: '/admin/open-items' },
  { name: 'Products', path: '/admin/products' },
  { name: 'Collections', path: '/admin/collections' },
  { name: 'Inventory', path: '/admin/inventory' },
  { name: 'Customers', path: '/admin/customers' },
  { name: 'Reps', path: '/admin/reps' },
  { name: 'Prepacks', path: '/admin/prepacks' },
  { name: 'Shopify', path: '/admin/shopify' },
  { name: 'Developer', path: '/admin/developer' },
  { name: 'Settings', path: '/admin/settings' },
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
