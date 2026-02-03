// ============================================================================
// Availability Settings (Scenario x View matrix)
// ============================================================================

// Scenarios (rows in the matrix)
export type AvailabilityScenario =
  | 'ats'
  | 'preorder_incoming'
  | 'preorder_no_incoming'

// Views (columns in the matrix)
export type AvailabilityView =
  | 'admin_products'
  | 'admin_inventory'
  | 'xlsx'
  | 'pdf'
  | 'buyer_products'
  | 'buyer_preorder'
  | 'rep_products'
  | 'rep_preorder'

export type ValueSource =
  | 'quantity'
  | 'onRoute'
  | 'incoming'
  | 'customText'

export type ZeroNullDisplay =
  | 'zero'
  | 'blank'
  | 'customText'

export interface AvailabilityCellConfig {
  label: string
  valueSource: ValueSource
  customValue?: string
  zeroNullDisplay: ZeroNullDisplay
  zeroNullCustomText?: string
}

export type AvailabilityMatrix = {
  [scenario in AvailabilityScenario]: {
    [view in AvailabilityView]: AvailabilityCellConfig
  }
}

export interface AvailabilitySettingsRecord {
  matrix: AvailabilityMatrix
  showOnRouteProducts: boolean
  showOnRouteInventory: boolean
  showOnRouteXlsx: boolean
  showOnRoutePdf: boolean
  onRouteLabelProducts: string
  onRouteLabelInventory: string
  onRouteLabelXlsx: string
  onRouteLabelPdf: string
  legendText: string
  showLegendAts: boolean
  showLegendPreorderIncoming: boolean
  showLegendPreorderNoIncoming: boolean
}

export interface AvailabilityInputs {
  quantity?: number | null
  onRoute?: number | null
  incoming?: number | null
  committed?: number | null
}

export interface AvailabilityDisplayResult {
  display: string
  numericValue: number | null
  isBlank: boolean
}
