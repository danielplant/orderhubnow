/**
 * Stock level thresholds for visual indicators.
 * IKEA-style: Keep it simple - only highlight what needs attention.
 */
export const STOCK_THRESHOLDS = {
  LOW: 6,
} as const;

/**
 * Stock status for simplified 3-state display.
 */
export type StockStatus = 'out' | 'low' | 'available';

/**
 * Get stock status for display purposes.
 * - out: No stock, grey out the chip
 * - low: 1-6 units, show small amber dot
 * - available: 7+ units, normal display (no indicator)
 */
export function getStockStatus(available: number): StockStatus {
  if (available === 0) return 'out';
  if (available <= STOCK_THRESHOLDS.LOW) return 'low';
  return 'available';
}
