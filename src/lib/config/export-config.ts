/**
 * Central configuration for XLSX (and future PDF) exports
 *
 * This configuration controls:
 * - Column layout and widths
 * - Row heights (image row vs data rows)
 * - Visual styling (colors, fonts, borders)
 * - Currency display options
 *
 * DEPRECATION NOTE (Phase 1 - Export Policy):
 * Thumbnail/image settings have been migrated to the database (SyncSettings table).
 * Use getExportPolicy() from '@/lib/data/queries/export-policy' instead of hardcoded values.
 * The EXPORT_THUMBNAIL constant has been removed - export routes now read from DB.
 */

import type {
  ExportColumn,
  ExportLayoutConfig,
  ExportStyleConfig,
  CurrencyConfig,
} from '@/lib/types/export'

/**
 * Row and layout configuration
 */
export const EXPORT_LAYOUT: ExportLayoutConfig = {
  headerRowHeight: 28,
  imageRowHeight: 75, // First row of each group (tall for image + wrapped text)
  dataRowHeight: 15, // Subsequent rows (compact)
  separatorStyle: 'border',
  freezeHeader: true,
}

/**
 * Visual styling configuration
 */
export const EXPORT_STYLING: ExportStyleConfig = {
  header: {
    bgColor: 'FF1E40AF', // Blue
    textColor: 'FFFFFFFF', // White
    font: { name: 'Arial', size: 11, bold: true },
  },
  dataRows: {
    font: { name: 'Arial', size: 10, bold: false },
    alignment: { vertical: 'bottom' },
    alternateRowBg: null, // No zebra striping
  },
  groupSeparator: {
    borderStyle: 'medium',
    borderColor: 'FF9CA3AF', // Darker gray for visibility
  },
}

/**
 * Column definitions for export
 *
 * Order matters - this is the column order in the exported file.
 * firstRowOnly: true means only show value on first row of each style group
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'image', header: 'Image', width: 14, type: 'image', firstRowOnly: true },
  { key: 'baseSku', header: 'Style', width: 12, type: 'text', firstRowOnly: true },
  { key: 'sku', header: 'SKU', width: 16, type: 'text', firstRowOnly: false },
  { key: 'description', header: 'Description', width: 28, type: 'text', firstRowOnly: true },
  { key: 'color', header: 'Color', width: 10, type: 'text', firstRowOnly: true },
  { key: 'material', header: 'Material', width: 16, type: 'text', firstRowOnly: true },
  { key: 'size', header: 'Size', width: 6, type: 'text', firstRowOnly: false },
  { key: 'available', header: 'Available', width: 8, type: 'number', firstRowOnly: false },
  { key: 'onRoute', header: 'On Route', width: 8, type: 'number', firstRowOnly: false },
  { key: 'collection', header: 'Collection', width: 14, type: 'text', firstRowOnly: true },
  { key: 'status', header: 'Status', width: 8, type: 'text', firstRowOnly: true },
  { key: 'units', header: 'Units', width: 6, type: 'number', firstRowOnly: true },
  { key: 'packPrice', header: 'Pack Price', width: 12, type: 'currency', firstRowOnly: true },
  { key: 'unitPrice', header: 'Unit Price', width: 12, type: 'currency', firstRowOnly: true },
  { key: 'orderQty', header: 'Qty', width: 6, type: 'number', firstRowOnly: false },
]

/**
 * Currency configuration
 */
export const CURRENCY_CONFIG: Record<'USD' | 'CAD', CurrencyConfig> = {
  USD: { symbol: '$', label: 'USD', priceField: 'PriceUSD' },
  CAD: { symbol: '$', label: 'CAD', priceField: 'PriceCAD' },
}

/**
 * Branding (for PDF exports)
 */
export const EXPORT_BRANDING = {
  companyName: 'Limeapple',
  primaryColor: '#1E40AF',
} as const

/**
 * Combined export config for convenience
 *
 * Note: Thumbnail settings are now in the database (SyncSettings).
 * Use getExportPolicy() from '@/lib/data/queries/export-policy' for thumbnail config.
 */
export const EXPORT_CONFIG = {
  layout: EXPORT_LAYOUT,
  styling: EXPORT_STYLING,
  columns: EXPORT_COLUMNS,
  currency: CURRENCY_CONFIG,
  branding: EXPORT_BRANDING,
} as const
