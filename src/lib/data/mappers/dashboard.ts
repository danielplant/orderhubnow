/**
 * Dashboard data types and mappers
 * Matches .NET behavior for Category Totals and PO Sold reports
 */

// ============================================================================
// Time Period Types
// ============================================================================

export type TimePeriod = 
  | 'today' 
  | 'thisWeek' 
  | 'thisMonth' 
  | 'thisQuarter' 
  | 'ttm' 
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export function getDateRangeForPeriod(period: TimePeriod, customRange?: DateRange): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (period) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1), // End of today
      };
    
    case 'thisWeek': {
      // Week starts on Monday
      const dayOfWeek = today.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday };
    }
    
    case 'thisMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    
    case 'thisQuarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), quarter * 3, 1),
        end: new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999),
      };
    }
    
    case 'ttm': {
      // Trailing Twelve Months
      const ttmStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      return {
        start: ttmStart,
        end: now,
      };
    }
    
    case 'custom':
      if (!customRange) {
        // Default to last 30 days if no custom range provided
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return { start: thirtyDaysAgo, end: now };
      }
      return customRange;
    
    default:
      return { start: today, end: now };
  }
}

// ============================================================================
// Dashboard Metrics Types
// ============================================================================

export type TrendDirection = 'up' | 'down' | 'flat';

export interface DashboardMetrics {
  ordersCount: number;
  ordersChange: number; // percentage change vs prior period
  ordersTrend: TrendDirection;
  revenue: number;
  revenueChange: number;
  revenueTrend: TrendDirection;
  unitsInStock: number;
  stockChange: number;
  stockTrend: TrendDirection;
  pendingSyncCount: number;
}

/**
 * Calculate the prior period date range for comparison
 */
export function getPriorPeriodRange(currentRange: DateRange): DateRange {
  const duration = currentRange.end.getTime() - currentRange.start.getTime();
  const priorEnd = new Date(currentRange.start.getTime() - 1); // Day before current start
  const priorStart = new Date(priorEnd.getTime() - duration);
  return { start: priorStart, end: priorEnd };
}

/**
 * Calculate trend direction from percentage change
 */
export function getTrendDirection(change: number): TrendDirection {
  if (change > 1) return 'up';
  if (change < -1) return 'down';
  return 'flat';
}

// ============================================================================
// Category Totals Types (matches .NET Report.aspx)
// ============================================================================

export interface CategoryTotal {
  mainCategory: string;
  subCategory: string;
  quantity: number;
}

export interface CategoryTotalsResult {
  items: CategoryTotal[];
  grandTotal: number;
}

// ============================================================================
// PO Sold Types (matches .NET POSoldReport.aspx)
// ============================================================================

// Size columns matching .NET - these are the bucket names
export const PO_SOLD_SIZE_COLUMNS = [
  '2', '3', '2/3', '4', '5', '4/5', '6', '5/6', '7', '8', '7/8',
  '10', '12', '10/12', '14', '16', '14/16', '6/6X', '2T-4T',
  '4-6', '7-16', '7-10', 'M/L', 'XS/S', '12M-24M', 'O/S'
] as const;

export type POSoldSizeColumn = typeof PO_SOLD_SIZE_COLUMNS[number];

// Raw result from SQL query
export interface POSoldRawRow {
  SKU: string;
  Size: string | null;
  CategoryID: number;
  CategoryName: string;
  Quantity: number;
}

// Aggregated row with size buckets (matches .NET POSoldQuantityReport class)
export interface POSoldRow {
  sku: string;
  categoryName: string;
  size2: number;
  size3: number;
  size2_3: number;
  size4: number;
  size5: number;
  size4_5: number;
  size6: number;
  size5_6: number;
  size7: number;
  size8: number;
  size7_8: number;
  size10: number;
  size12: number;
  size10_12: number;
  size14: number;
  size16: number;
  size14_16: number;
  size6_6X: number;
  size2T_4T: number;
  size4_6: number;
  size7_16: number;
  size7_10: number;
  sizeM_L: number;
  sizeXS_S: number;
  size12M_24M: number;
  sizeO_S: number;
  total: number;
}

/**
 * Normalize a Size field value to a bucket-compatible key.
 * Handles formats like:
 *   "XS/S (6-8)" → "XS/S"
 *   "M/L - size 7 to 16" → "M/L"
 *   "S (7-8)" → "S"
 *   "JR-S" → "S"
 *   "6-12M" → "12M-24M" (baby sizes)
 */
export function normalizeSizeToBucket(size: string | null): string | null {
  if (!size) return null;

  const s = size.toUpperCase().trim();

  // Handle baby month sizes (e.g., "6-12M", "12-18M")
  if (/^\d+-\d+M$/.test(s)) {
    return '12M-24M';
  }

  // Handle "JR-X" prefix sizes
  if (s.startsWith('JR-')) {
    return s.substring(3); // "JR-S" → "S"
  }

  // Extract base size before parenthesis or dash-description
  // "XS/S (6-8)" → "XS/S"
  // "M/L - size 7 to 16" → "M/L"
  const match = s.match(/^([A-Z0-9/]+)/);
  if (match) {
    const base = match[1];

    // Map individual letters to combined sizes
    const letterMap: Record<string, string> = {
      'XS': 'XS/S',
      'S': 'XS/S',
      'M': 'M/L',
      'L': 'M/L',
      '6X': '6/6X',
    };

    return letterMap[base] || base;
  }

  return null;
}

/**
 * Get the property key for a size bucket
 */
export function getSizeBucketKey(size: string): keyof POSoldRow | null {
  const keyMap: Record<string, keyof POSoldRow> = {
    '2': 'size2',
    '3': 'size3',
    '2/3': 'size2_3',
    '4': 'size4',
    '5': 'size5',
    '4/5': 'size4_5',
    '6': 'size6',
    '5/6': 'size5_6',
    '7': 'size7',
    '8': 'size8',
    '7/8': 'size7_8',
    '10': 'size10',
    '12': 'size12',
    '10/12': 'size10_12',
    '14': 'size14',
    '16': 'size16',
    '14/16': 'size14_16',
    '6/6X': 'size6_6X',
    '2T-4T': 'size2T_4T',
    '4-6': 'size4_6',
    '7-16': 'size7_16',
    '7-10': 'size7_10',
    'M/L': 'sizeM_L',
    'XS/S': 'sizeXS_S',
    '12M-24M': 'size12M_24M',
    'O/S': 'sizeO_S',
  };
  
  return keyMap[size] || null;
}

/**
 * Create an empty PO Sold row with all size buckets initialized to 0
 */
export function createEmptyPOSoldRow(sku: string, categoryName: string): POSoldRow {
  return {
    sku,
    categoryName,
    size2: 0,
    size3: 0,
    size2_3: 0,
    size4: 0,
    size5: 0,
    size4_5: 0,
    size6: 0,
    size5_6: 0,
    size7: 0,
    size8: 0,
    size7_8: 0,
    size10: 0,
    size12: 0,
    size10_12: 0,
    size14: 0,
    size16: 0,
    size14_16: 0,
    size6_6X: 0,
    size2T_4T: 0,
    size4_6: 0,
    size7_16: 0,
    size7_10: 0,
    sizeM_L: 0,
    sizeXS_S: 0,
    size12M_24M: 0,
    sizeO_S: 0,
    total: 0,
  };
}
