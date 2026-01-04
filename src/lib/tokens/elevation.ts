/**
 * Elevation (Shadow) Scale
 * 
 * Progressive shadow depth for visual hierarchy.
 * Uses subtle, diffused shadows for modern aesthetic.
 */
export const ELEVATION = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 2px 8px rgba(0, 0, 0, 0.08)",
  lg: "0 8px 24px rgba(0, 0, 0, 0.12)",
  xl: "0 16px 48px rgba(0, 0, 0, 0.16)",
} as const;

export type ElevationLevel = keyof typeof ELEVATION;
