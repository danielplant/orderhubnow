/**
 * Export configuration types
 *
 * Used by XLSX export (and future PDF export)
 */

export type CurrencyMode = 'USD' | 'CAD' | 'BOTH'

export type ColumnType = 'image' | 'text' | 'number' | 'currency'

export interface ExportColumn {
  key: string
  header: string
  width: number
  type: ColumnType
  firstRowOnly: boolean
}

export interface ExportOptions {
  currency: CurrencyMode
  // Future: format: 'xlsx' | 'pdf'
}

export interface ExportLayoutConfig {
  headerRowHeight: number
  imageRowHeight: number
  dataRowHeight: number
  separatorStyle: 'border' | 'empty-row'
  freezeHeader: boolean
}

export interface ExportFontConfig {
  name: string
  size: number
  bold: boolean
}

export interface ExportStyleConfig {
  header: {
    bgColor: string
    textColor: string
    font: ExportFontConfig
  }
  dataRows: {
    font: ExportFontConfig
    alignment: { vertical: 'top' | 'middle' | 'bottom' }
    alternateRowBg: string | null
  }
  groupSeparator: {
    borderStyle: 'thin' | 'medium' | 'thick'
    borderColor: string
  }
}

export interface CurrencyConfig {
  symbol: string
  label: string
  priceField: 'PriceUSD' | 'PriceCAD'
}
