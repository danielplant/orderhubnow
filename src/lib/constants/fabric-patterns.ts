/**
 * CSS pattern mappings for fabric types
 * Each normalized fabric category gets a distinct visual pattern
 */

export const FABRIC_PATTERN_CSS: Record<string, string> = {
  'Plush': 'radial-gradient(circle at 3px 3px, #9ca3af 2px, transparent 2px)',
  'Organic Cotton': 'radial-gradient(#6b7280 1px, transparent 1px)',
  'Cotton Blend': 'radial-gradient(#6b7280 1.5px, transparent 1.5px)',
  'UPF 50+': 'repeating-conic-gradient(from 0deg, #f59e0b 0deg 30deg, transparent 30deg 60deg)',
  'French Terry': 'repeating-linear-gradient(0deg, #6b7280 0 1px, transparent 1px 4px)',
  'Jersey': 'repeating-linear-gradient(45deg, #6b7280 0 1px, transparent 1px 4px)',
  'Viscose Blend': 'repeating-linear-gradient(135deg, #6b7280 0 1px, transparent 1px 3px)',
  'Satin': 'linear-gradient(135deg, #d1d5db 0%, #9ca3af 50%, #d1d5db 100%)',
  'Nylon Blend': 'repeating-linear-gradient(0deg, #6b7280 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, #6b7280 0 1px, transparent 1px 4px)',
  'Polyester Blend': 'repeating-linear-gradient(45deg, #6b7280 0 1px, transparent 1px 3px)',
  'Crochet': 'repeating-linear-gradient(45deg, transparent 0 2px, #6b7280 2px 3px), repeating-linear-gradient(-45deg, transparent 0 2px, #6b7280 2px 3px)',
  'Other': 'none',
}

// Background size needed for patterns that use radial-gradient
export const FABRIC_PATTERN_SIZE: Record<string, string> = {
  'Plush': '8px 8px',
  'Organic Cotton': '6px 6px',
  'Cotton Blend': '5px 5px',
  'UPF 50+': '16px 16px',
  'French Terry': 'auto',
  'Jersey': 'auto',
  'Viscose Blend': 'auto',
  'Satin': 'auto',
  'Nylon Blend': 'auto',
  'Polyester Blend': 'auto',
  'Crochet': 'auto',
  'Other': 'auto',
}

export function getPatternCSS(normalizedFabric: string): string {
  return FABRIC_PATTERN_CSS[normalizedFabric] ?? FABRIC_PATTERN_CSS['Other']
}

export function getPatternSize(normalizedFabric: string): string {
  return FABRIC_PATTERN_SIZE[normalizedFabric] ?? 'auto'
}
