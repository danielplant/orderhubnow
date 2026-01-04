/**
 * Feature flags for progressive rollout.
 * Toggle features without code changes.
 */
export const FEATURES = {
  /** Show "on route" inventory counts when data is available */
  SHOW_ON_ROUTE: false,
  /** Display price tier incentives in card footer */
  SHOW_PRICE_TIERS: true,
  /** Show MOQ warning when order is below minimum */
  SHOW_MOQ_WARNING: true,
  /** Enable keyboard shortcuts for power users */
  ENABLE_KEYBOARD_SHORTCUTS: true,
  /** Show margin percentage and dollar savings on product cards */
  SHOW_MARGIN: true,
  /** Show "Best Seller" badge for popular products */
  SHOW_POPULARITY: true,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
