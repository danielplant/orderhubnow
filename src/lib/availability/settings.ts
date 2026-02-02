import { z } from 'zod'
import type {
  AvailabilityScenario,
  AvailabilityView,
  AvailabilityCellConfig,
  AvailabilityMatrix,
  AvailabilitySettingsRecord,
} from '@/lib/types/availability-settings'

export const AVAILABILITY_LEGEND_TEXT =
  'Blank means no inbound PO yet — pre-order allowed.'

export const SCENARIOS: AvailabilityScenario[] = [
  'ats',
  'preorder_incoming',
  'preorder_no_incoming',
]

export const VIEWS: AvailabilityView[] = [
  'admin_products',
  'admin_inventory',
  'xlsx',
  'pdf',
  'buyer_products',
  'buyer_preorder',
  'rep_products',
  'rep_preorder',
]

const VALUE_SOURCES = ['quantity', 'onRoute', 'incoming', 'customText'] as const
const ZERO_NULL_DISPLAY = ['zero', 'blank', 'customText'] as const

export const AvailabilityCellConfigSchema = z.object({
  label: z.string().min(1),
  valueSource: z.enum(VALUE_SOURCES),
  customValue: z.string().optional(),
  zeroNullDisplay: z.enum(ZERO_NULL_DISPLAY),
  zeroNullCustomText: z.string().optional(),
})

export const AvailabilityCellConfigPartialSchema =
  AvailabilityCellConfigSchema.partial()

const ATS_CELL: AvailabilityCellConfig = {
  label: 'Available',
  valueSource: 'quantity',
  zeroNullDisplay: 'zero',
}

const PREORDER_INCOMING_CELL: AvailabilityCellConfig = {
  label: 'Available',
  valueSource: 'onRoute',
  zeroNullDisplay: 'zero',
}

const PREORDER_NO_INCOMING_CELL: AvailabilityCellConfig = {
  label: 'Available',
  valueSource: 'customText',
  customValue: '',
  zeroNullDisplay: 'blank',
}

export function buildDefaultMatrix(): AvailabilityMatrix {
  const matrix = {} as AvailabilityMatrix

  for (const scenario of SCENARIOS) {
    matrix[scenario] = {} as AvailabilityMatrix[typeof scenario]
    for (const view of VIEWS) {
      if (scenario === 'ats') {
        matrix[scenario][view] = { ...ATS_CELL }
      } else if (scenario === 'preorder_incoming') {
        matrix[scenario][view] = { ...PREORDER_INCOMING_CELL }
      } else {
        matrix[scenario][view] = { ...PREORDER_NO_INCOMING_CELL }
      }
    }
  }

  return matrix
}

export const DEFAULT_MATRIX = buildDefaultMatrix()

export const DEFAULT_SETTINGS: AvailabilitySettingsRecord = {
  matrix: DEFAULT_MATRIX,
  showOnRouteProducts: false,
  showOnRouteInventory: false,
  showOnRouteXlsx: false,
  showOnRoutePdf: false,
  onRouteLabelProducts: 'On Route',
  onRouteLabelInventory: 'On Route',
  onRouteLabelXlsx: 'On Route',
  onRouteLabelPdf: 'On Route',
}

export function normalizeCellConfig(
  input: unknown,
  fallback: AvailabilityCellConfig
): AvailabilityCellConfig {
  const parsed = AvailabilityCellConfigPartialSchema.safeParse(input)
  if (!parsed.success) return { ...fallback }

  const merged: AvailabilityCellConfig = {
    ...fallback,
    ...parsed.data,
  }

  if (merged.valueSource === 'customText' && merged.customValue == null) {
    merged.customValue = ''
  }
  if (merged.zeroNullDisplay === 'customText' && merged.zeroNullCustomText == null) {
    merged.zeroNullCustomText = ''
  }

  return merged
}

export function normalizeAvailabilityMatrix(input: unknown): AvailabilityMatrix {
  const defaults = buildDefaultMatrix()
  if (!input || typeof input !== 'object') return defaults

  const matrix = defaults
  const raw = input as Record<string, unknown>

  for (const scenario of SCENARIOS) {
    const scenarioRaw = raw[scenario] as Record<string, unknown> | undefined
    for (const view of VIEWS) {
      const cellRaw = scenarioRaw?.[view]
      matrix[scenario][view] = normalizeCellConfig(
        cellRaw,
        defaults[scenario][view]
      )
    }
  }

  return matrix
}

export function normalizeAvailabilitySettings(
  input: Partial<AvailabilitySettingsRecord> | null | undefined
): AvailabilitySettingsRecord {
  if (!input) return DEFAULT_SETTINGS

  const matrix = input.matrix
    ? normalizeAvailabilityMatrix(input.matrix)
    : DEFAULT_MATRIX

  return {
    matrix,
    showOnRouteProducts: input.showOnRouteProducts ?? DEFAULT_SETTINGS.showOnRouteProducts,
    showOnRouteInventory: input.showOnRouteInventory ?? DEFAULT_SETTINGS.showOnRouteInventory,
    showOnRouteXlsx: input.showOnRouteXlsx ?? DEFAULT_SETTINGS.showOnRouteXlsx,
    showOnRoutePdf: input.showOnRoutePdf ?? DEFAULT_SETTINGS.showOnRoutePdf,
    onRouteLabelProducts: input.onRouteLabelProducts ?? DEFAULT_SETTINGS.onRouteLabelProducts,
    onRouteLabelInventory: input.onRouteLabelInventory ?? DEFAULT_SETTINGS.onRouteLabelInventory,
    onRouteLabelXlsx: input.onRouteLabelXlsx ?? DEFAULT_SETTINGS.onRouteLabelXlsx,
    onRouteLabelPdf: input.onRouteLabelPdf ?? DEFAULT_SETTINGS.onRouteLabelPdf,
  }
}
