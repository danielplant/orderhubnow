/**
 * Motion Tokens
 * 
 * Consistent animation timing for cohesive feel.
 * Based on Material Design and Apple HIG principles.
 */
export const DURATION = {
  instant: "0ms",
  fast: "150ms",      // Micro-interactions, hovers
  normal: "300ms",    // Standard transitions
  slow: "500ms",      // Complex animations, page transitions
  slower: "700ms",    // Elaborate animations
} as const;

export const EASING = {
  default: "cubic-bezier(0.4, 0, 0.2, 1)",    // Smooth, natural
  in: "cubic-bezier(0.4, 0, 1, 1)",           // Accelerate
  out: "cubic-bezier(0, 0, 0.2, 1)",          // Decelerate
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",      // Smooth both
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)", // Bouncy
  linear: "linear",
} as const;

export type DurationKey = keyof typeof DURATION;
export type EasingKey = keyof typeof EASING;
