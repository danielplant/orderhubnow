import { prisma } from '@/lib/prisma'

export interface DisplayRuleRecord {
  id: number
  scenario: string
  view: string
  fieldSource: string
  label: string
  rowBehavior: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Get all display rules
 */
export async function getDisplayRules(): Promise<DisplayRuleRecord[]> {
  const rules = await prisma.displayRule.findMany({
    orderBy: [
      { scenario: 'asc' },
      { view: 'asc' },
    ],
  })

  return rules.map((r) => ({
    id: r.id,
    scenario: r.scenario,
    view: r.view,
    fieldSource: r.fieldSource,
    label: r.label,
    rowBehavior: r.rowBehavior,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

/**
 * Get display rules grouped by scenario
 */
export async function getDisplayRulesGrouped(): Promise<Record<string, Record<string, DisplayRuleRecord>>> {
  const rules = await getDisplayRules()
  
  const grouped: Record<string, Record<string, DisplayRuleRecord>> = {}
  
  for (const rule of rules) {
    if (!grouped[rule.scenario]) {
      grouped[rule.scenario] = {}
    }
    grouped[rule.scenario][rule.view] = rule
  }
  
  return grouped
}

/**
 * Get a single display rule by scenario and view
 */
export async function getDisplayRule(scenario: string, view: string): Promise<DisplayRuleRecord | null> {
  const rule = await prisma.displayRule.findUnique({
    where: {
      scenario_view: {
        scenario,
        view,
      },
    },
  })

  if (!rule) return null

  return {
    id: rule.id,
    scenario: rule.scenario,
    view: rule.view,
    fieldSource: rule.fieldSource,
    label: rule.label,
    rowBehavior: rule.rowBehavior,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
}
