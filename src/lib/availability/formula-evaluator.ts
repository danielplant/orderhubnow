/**
 * Formula Evaluator for Calculated Fields
 * 
 * Safely evaluates simple arithmetic formulas using field values.
 * Only allows: field names, numbers, arithmetic operators (+, -, *, /), and parentheses.
 */

export interface FormulaInputs {
  on_hand: number
  incoming: number
  committed: number
}

// Valid field names that can be used in formulas
const VALID_FIELD_NAMES = ['on_hand', 'incoming', 'committed']

// Valid operators
const VALID_OPERATORS = ['+', '-', '*', '/', '(', ')']

/**
 * Validate a formula string
 * Only allows: field names, numbers, arithmetic operators, parentheses, whitespace
 */
export function validateFormula(formula: string): { valid: boolean; error?: string } {
  if (!formula || formula.trim().length === 0) {
    return { valid: false, error: 'Formula cannot be empty' }
  }

  // Remove whitespace for easier parsing
  const cleaned = formula.replace(/\s+/g, ' ').trim()

  // Tokenize: split by operators while keeping them
  const tokens = cleaned.split(/([+\-*/()]|\s+)/).filter((t) => t.trim().length > 0)

  for (const token of tokens) {
    const trimmed = token.trim()
    
    // Skip operators
    if (VALID_OPERATORS.includes(trimmed)) continue
    
    // Check if it's a valid field name
    if (VALID_FIELD_NAMES.includes(trimmed)) continue
    
    // Check if it's a number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) continue
    
    // Invalid token
    return { 
      valid: false, 
      error: `Invalid token in formula: "${trimmed}". Valid fields are: ${VALID_FIELD_NAMES.join(', ')}` 
    }
  }

  // Check balanced parentheses
  let parenCount = 0
  for (const char of cleaned) {
    if (char === '(') parenCount++
    if (char === ')') parenCount--
    if (parenCount < 0) {
      return { valid: false, error: 'Unbalanced parentheses' }
    }
  }
  if (parenCount !== 0) {
    return { valid: false, error: 'Unbalanced parentheses' }
  }

  return { valid: true }
}

/**
 * Evaluate a formula string with the given input values.
 * Returns null if the formula is invalid or cannot be evaluated.
 */
export function evaluateFormula(
  formula: string,
  inputs: FormulaInputs
): number | null {
  if (!formula || formula.trim().length === 0) {
    return null
  }

  try {
    // Replace field names with values
    const expr = formula
      .replace(/\bon_hand\b/g, String(inputs.on_hand))
      .replace(/\bincoming\b/g, String(inputs.incoming))
      .replace(/\bcommitted\b/g, String(inputs.committed))

    // Validate that the expression only contains safe characters
    // Allow: digits, decimal points, operators, parentheses, whitespace
    if (!/^[\d\s.+\-*/()]+$/.test(expr)) {
      console.warn('Invalid formula expression:', expr)
      return null
    }

    // Evaluate using Function constructor (safer than eval for this use case)
     
    const result = new Function(`"use strict"; return (${expr})`)()

    if (typeof result !== 'number' || !isFinite(result)) {
      return null
    }

    return result
  } catch (err) {
    console.warn('Formula evaluation error:', err)
    return null
  }
}

/**
 * Get the field value by field name or calculated field formula.
 * 
 * @param fieldSource - Either a raw field name (on_hand, incoming, committed) or a calculated field name
 * @param inputs - The raw input values
 * @param formulaMap - Map of calculated field names to their formulas
 */
export function getFieldValue(
  fieldSource: string,
  inputs: FormulaInputs,
  formulaMap: Record<string, string>
): number | null {
  // Handle blank
  if (fieldSource === '(blank)' || fieldSource === 'blank' || !fieldSource) {
    return null
  }

  // Handle raw fields
  switch (fieldSource) {
    case 'on_hand':
    case 'quantity':
      return inputs.on_hand
    case 'incoming':
      return inputs.incoming
    case 'committed':
      return inputs.committed
    case 'onRoute':
      // Legacy support: onRoute = incoming - committed
      return Math.max(0, inputs.incoming - inputs.committed)
  }

  // Handle calculated fields
  const formula = formulaMap[fieldSource]
  if (formula) {
    return evaluateFormula(formula, inputs)
  }

  // Unknown field
  console.warn('Unknown field source:', fieldSource)
  return null
}
