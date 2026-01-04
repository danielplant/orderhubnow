/**
 * Color name to hex value mapping for product color swatches.
 */
export const COLOR_HEX_MAP: Record<string, string> = {
  // Pinks & Purples
  purple: "#9333ea",
  orchid: "#da70d6",
  pink: "#ec4899",
  violet: "#8b5cf6",
  fuchsia: "#d946ef",

  // Reds & Oranges
  red: "#ef4444",
  coral: "#ff7f50",
  orange: "#f97316",

  // Yellows & Greens
  yellow: "#eab308",
  gold: "#ffd700",
  lime: "#84cc16",
  green: "#22c55e",

  // Blues & Teals
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  navy: "#1e3a8a",
  indigo: "#6366f1",

  // Neutrals
  white: "#ffffff",
  black: "#171717",
  gray: "#6b7280",
  grey: "#6b7280",
  brown: "#92400e",

  // Special
  multi: "linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6)",
  multicolor: "linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6)",
};

const DEFAULT_COLOR = "#a1a1aa";

/**
 * Get hex color value from a color name.
 * Handles case-insensitive matching and strips non-alpha characters.
 */
export function getColorHex(colorName: string): string {
  const key = colorName.toLowerCase().replace(/[^a-z]/g, "");
  return COLOR_HEX_MAP[key] || DEFAULT_COLOR;
}
