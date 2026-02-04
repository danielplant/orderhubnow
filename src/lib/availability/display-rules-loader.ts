/**
 * Display Rules Loader
 * 
 * Loads DisplayRule and CalculatedField data from the database
 * and provides functions to compute availability display values.
 */

import { prisma } from '@/lib/prisma'
import { getFieldValue, type FormulaInputs } from './formula-evaluator'

export type { FormulaInputs }

export interface DisplayRuleConfig {
  fieldSource: string
  label: string
  rowBehavior: string
}

export interface DisplayRulesData {
  rules: Record<string, Record<string, DisplayRuleConfig>>
  formulas: Record<string, string>
}

let cachedData: DisplayRulesData | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60_000 // 1 minute cache

/**
 * Load display rules and calculated fields from the database.
 * Results are cached for 1 minute.
 */
export async function loadDisplayRulesData(): Promise<DisplayRulesData> {
  const now = Date.now()
  
  // Return cached data if still valid
  if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedData
  }

  const [displayRules, calculatedFields] = await Promise.all([
    prisma.displayRule.findMany(),
    prisma.calculatedField.findMany(),
  ])

  // Build rules map: scenario -> view -> config
  const rules: Record<string, Record<string, DisplayRuleConfig>> = {}
  for (const rule of displayRules) {
    if (!rules[rule.scenario]) {
      rules[rule.scenario] = {}
    }
    rules[rule.scenario][rule.view] = {
      fieldSource: rule.fieldSource,
      label: rule.label,
      rowBehavior: rule.rowBehavior,
    }
  }

  // Build formulas map: name -> formula
  const formulas: Record<string, string> = {}
  for (const field of calculatedFields) {
    formulas[field.name] = field.formula
  }

  cachedData = { rules, formulas }
  cacheTimestamp = now

  return cachedData
}

/**
 * Clear the display rules cache (call after updates)
 */
export function clearDisplayRulesCache(): void {
  cachedData = null
  cacheTimestamp = 0
}

/**
 * Map collection type to scenario key
 */
export function getScenarioFromCollectionType(
  collectionType: string | null | undefined
): string {
  if (collectionType === 'preorder_po') return 'preorder_po'
  if (collectionType === 'preorder_no_po') return 'preorder_no_po'
  if (collectionType === 'ats') return 'ats'
  
  // Legacy support
  if (collectionType === 'PreOrder') return 'preorder_po'
  if (collectionType === 'ATS') return 'ats'
  
  return 'ats'
}

/**
 * Compute the display value for a given scenario and view.
 */
export function computeDisplayFromRules(
  scenario: string,
  view: string,
  inputs: FormulaInputs,
  data: DisplayRulesData
): { display: string; numericValue: number | null; isBlank: boolean; label: string } {
  const ruleConfig = data.rules[scenario]?.[view]

  if (!ruleConfig) {
    // Fallback to showing quantity
    const value = inputs.on_hand
    return {
      display: String(value),
      numericValue: value,
      isBlank: false,
      label: 'Available',
    }
  }

  const { fieldSource, label } = ruleConfig

  // Handle blank
  if (fieldSource === '(blank)' || fieldSource === 'blank') {
    return {
      display: '',
      numericValue: null,
      isBlank: true,
      label,
    }
  }

  // Compute value
  const value = getFieldValue(fieldSource, inputs, data.formulas)

  if (value === null) {
    return {
      display: '',
      numericValue: null,
      isBlank: true,
      label,
    }
  }

  return {
    display: String(Math.round(value)),
    numericValue: value,
    isBlank: false,
    label,
  }
}
