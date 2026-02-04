'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { clearDisplayRulesCache } from '@/lib/availability/display-rules-loader'

export interface UpdateDisplayRuleInput {
  scenario: string
  view: string
  fieldSource: string
  label: string
  rowBehavior?: string
}

/**
 * Update a single display rule
 */
export async function updateDisplayRule(
  input: UpdateDisplayRuleInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.displayRule.upsert({
      where: {
        scenario_view: {
          scenario: input.scenario,
          view: input.view,
        },
      },
      update: {
        fieldSource: input.fieldSource,
        label: input.label,
        rowBehavior: input.rowBehavior ?? 'show',
      },
      create: {
        scenario: input.scenario,
        view: input.view,
        fieldSource: input.fieldSource,
        label: input.label,
        rowBehavior: input.rowBehavior ?? 'show',
      },
    })

    // Clear in-memory cache so changes take effect immediately
    clearDisplayRulesCache()

    revalidatePath('/admin/business/display-rules')
    revalidatePath('/admin/products')
    revalidatePath('/admin/inventory')
    revalidatePath('/buyer', 'layout')

    return { success: true }
  } catch (err) {
    console.error('Error updating display rule:', err)
    return { success: false, error: 'Failed to update display rule' }
  }
}

/**
 * Bulk update multiple display rules
 */
export async function updateDisplayRulesBulk(
  rules: UpdateDisplayRuleInput[]
): Promise<{ success: boolean; error?: string; updated?: number }> {
  try {
    let updated = 0

    await prisma.$transaction(async (tx) => {
      for (const rule of rules) {
        await tx.displayRule.upsert({
          where: {
            scenario_view: {
              scenario: rule.scenario,
              view: rule.view,
            },
          },
          update: {
            fieldSource: rule.fieldSource,
            label: rule.label,
            rowBehavior: rule.rowBehavior ?? 'show',
          },
          create: {
            scenario: rule.scenario,
            view: rule.view,
            fieldSource: rule.fieldSource,
            label: rule.label,
            rowBehavior: rule.rowBehavior ?? 'show',
          },
        })
        updated++
      }
    })

    // Clear in-memory cache so changes take effect immediately
    clearDisplayRulesCache()

    revalidatePath('/admin/business/display-rules')
    revalidatePath('/admin/products')
    revalidatePath('/admin/inventory')
    revalidatePath('/buyer', 'layout')

    return { success: true, updated }
  } catch (err) {
    console.error('Error bulk updating display rules:', err)
    return { success: false, error: 'Failed to update display rules' }
  }
}

/**
 * Reset all display rules to defaults
 */
export async function resetDisplayRulesToDefaults(): Promise<{ success: boolean; error?: string }> {
  try {
    const SCENARIOS = ['ats', 'preorder_po', 'preorder_no_po']
    const VIEWS = [
      'admin_products', 'admin_inventory', 'admin_modal',
      'buyer_ats', 'buyer_preorder',
      'rep_ats', 'rep_preorder',
      'xlsx', 'pdf'
    ]

    const defaults: Record<string, { fieldSource: string; label: string }> = {
      ats: { fieldSource: 'on_hand', label: 'Available' },
      preorder_po: { fieldSource: 'net_po', label: 'Available' },
      preorder_no_po: { fieldSource: '(blank)', label: '' },
    }

    const rules: UpdateDisplayRuleInput[] = []
    
    for (const scenario of SCENARIOS) {
      const defaultConfig = defaults[scenario]
      for (const view of VIEWS) {
        rules.push({
          scenario,
          view,
          fieldSource: defaultConfig.fieldSource,
          label: defaultConfig.label,
          rowBehavior: 'show',
        })
      }
    }

    return await updateDisplayRulesBulk(rules)
  } catch (err) {
    console.error('Error resetting display rules:', err)
    return { success: false, error: 'Failed to reset display rules' }
  }
}
