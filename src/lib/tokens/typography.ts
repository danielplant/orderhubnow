/**
 * Typography Scale
 * 
 * Based on 1.25 ratio (Major Third) for harmonious scaling.
 * Each step is ~25% larger than the previous.
 */
export const TYPE_SCALE = {
  "2xs": "0.625rem",   // 10px - captions, badges
  "xs": "0.75rem",     // 12px - labels, metadata
  "sm": "0.875rem",    // 14px - body small, UI text
  "base": "1rem",      // 16px - body default
  "lg": "1.125rem",    // 18px - body large
  "xl": "1.25rem",     // 20px - heading small
  "2xl": "1.5rem",     // 24px - heading medium
  "3xl": "1.875rem",   // 30px - heading large
  "4xl": "2.25rem",    // 36px - display small
  "5xl": "3rem",       // 48px - display medium
  "6xl": "3.75rem",    // 60px - display large
  "7xl": "4.5rem",     // 72px - display xl
} as const;

export const FONT_WEIGHT = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const LINE_HEIGHT = {
  none: "1",
  tight: "1.25",
  snug: "1.375",
  normal: "1.5",
  relaxed: "1.625",
  loose: "2",
} as const;

export const LETTER_SPACING = {
  tighter: "-0.05em",
  tight: "-0.025em",
  normal: "0",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em",
} as const;
