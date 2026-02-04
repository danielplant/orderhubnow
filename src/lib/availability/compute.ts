import type {
  AvailabilityScenario,
  AvailabilityView,
  AvailabilityInputs,
  AvailabilityDisplayResult,
  AvailabilitySettingsRecord,
} from '@/lib/types/availability-settings'
import { 
  loadDisplayRulesData, 
  computeDisplayFromRules, 
  getScenarioFromCollectionType,
  type DisplayRulesData,
  type FormulaInputs,
} from './display-rules-loader'

/**
 * Get the availability scenario based on collection type.
 * Now uses explicit collection type values instead of inferring from incoming data.
 * 
 * @deprecated Use getScenarioFromCollectionType from display-rules-loader instead
 */
export function getAvailabilityScenario(
  collectionType: string | null | undefined
): AvailabilityScenario {
  if (collectionType === 'preorder_po') return 'preorder_incoming'
  if (collectionType === 'preorder_no_po') return 'preorder_no_incoming'
  return 'ats'
}

/**
 * Map view name to the view keys used in DisplayRule table.
 * This helps transition from old view names to new ones.
 */
export function mapViewToDisplayRuleView(view: AvailabilityView): string {
  const mapping: Record<AvailabilityView, string> = {
    admin_products: 'admin_products',
    admin_inventory: 'admin_inventory',
    xlsx: 'xlsx',
    pdf: 'pdf',
    buyer_products: 'buyer_ats',
    buyer_preorder: 'buyer_preorder',
    rep_products: 'rep_ats',
    rep_preorder: 'rep_preorder',
  }
  return mapping[view] || view
}

/**
 * Map old scenario names to new DisplayRule scenario keys.
 */
export function mapScenarioToDisplayRuleScenario(scenario: AvailabilityScenario): string {
  const mapping: Record<AvailabilityScenario, string> = {
    ats: 'ats',
    preorder_incoming: 'preorder_po',
    preorder_no_incoming: 'preorder_no_po',
  }
  return mapping[scenario] || scenario
}

/**
 * Compute availability display using the new DisplayRule table.
 * This is the preferred method going forward.
 */
export async function computeAvailabilityDisplayFromRules(
  collectionType: string | null | undefined,
  view: string,
  inputs: {
    quantity?: number | null
    onRoute?: number | null
    incoming?: number | null
    committed?: number | null
  },
  displayRulesData?: DisplayRulesData
): Promise<AvailabilityDisplayResult & { label: string }> {
  const data = displayRulesData ?? await loadDisplayRulesData()
  
  const scenario = getScenarioFromCollectionType(collectionType)
  
  const formulaInputs: FormulaInputs = {
    on_hand: inputs.quantity ?? 0,
    incoming: inputs.incoming ?? 0,
    committed: inputs.committed ?? 0,
  }

  const result = computeDisplayFromRules(scenario, view, formulaInputs, data)

  return {
    display: result.display,
    numericValue: result.numericValue,
    isBlank: result.isBlank,
    label: result.label,
  }
}

// Re-export for convenience
export { loadDisplayRulesData, getScenarioFromCollectionType }
export type { DisplayRulesData, FormulaInputs }

export function computeAvailabilityDisplay(
  scenario: AvailabilityScenario,
  view: AvailabilityView,
  inputs: AvailabilityInputs,
  settings: AvailabilitySettingsRecord
): AvailabilityDisplayResult {
  const cell = settings.matrix[scenario][view]

  let rawValue: number | null = null
  let display = ''

  switch (cell.valueSource) {
    case 'quantity':
      rawValue = inputs.quantity ?? null
      break
    case 'onRoute':
      rawValue = inputs.onRoute ?? null
      break
    case 'incoming':
      rawValue = inputs.incoming ?? null
      break
    case 'customText':
      display = cell.customValue ?? ''
      rawValue = null
      break
    default:
      rawValue = inputs.quantity ?? null
  }

  if (cell.valueSource !== 'customText') {
    const isZeroOrNull = rawValue == null || rawValue === 0
    if (isZeroOrNull) {
      if (cell.zeroNullDisplay === 'zero') {
        display = '0'
      } else if (cell.zeroNullDisplay === 'customText') {
        display = cell.zeroNullCustomText ?? ''
      } else {
        display = ''
      }
    } else {
      display = String(rawValue)
    }
  }

  return {
    display,
    numericValue: rawValue,
    isBlank: display === '',
  }
}
