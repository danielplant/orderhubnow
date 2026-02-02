import type {
  AvailabilityScenario,
  AvailabilityView,
  AvailabilityInputs,
  AvailabilityDisplayResult,
  AvailabilitySettingsRecord,
} from '@/lib/types/availability-settings'

export function getAvailabilityScenario(
  collectionType: string | null | undefined,
  incoming: number | null | undefined
): AvailabilityScenario {
  if (collectionType !== 'PreOrder') return 'ats'
  if (incoming != null) return 'preorder_incoming'
  return 'preorder_no_incoming'
}

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
