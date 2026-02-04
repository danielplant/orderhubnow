import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getDisplayRules, getDisplayRulesGrouped } from '@/lib/data/queries/display-rules'
import { 
  updateDisplayRulesBulk, 
  resetDisplayRulesToDefaults,
  type UpdateDisplayRuleInput 
} from '@/lib/data/actions/display-rules'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const grouped = searchParams.get('grouped') === 'true'

  if (grouped) {
    const rules = await getDisplayRulesGrouped()
    return NextResponse.json({ rules })
  }

  const rules = await getDisplayRules()
  return NextResponse.json({ rules })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Check if this is a reset request
    if (body.reset === true) {
      const result = await resetDisplayRulesToDefaults()
      if (!result.success) {
        return NextResponse.json({ error: result.error ?? 'Failed to reset' }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: 'Reset to defaults' })
    }

    // Otherwise, expect an array of rules to update
    const rules = body.rules as UpdateDisplayRuleInput[]

    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json({ error: 'Rules array is required' }, { status: 400 })
    }

    // Validate each rule
    for (const rule of rules) {
      if (!rule.scenario || !rule.view || !rule.fieldSource) {
        return NextResponse.json(
          { error: 'Each rule must have scenario, view, and fieldSource' },
          { status: 400 }
        )
      }
    }

    const result = await updateDisplayRulesBulk(rules)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to update' }, { status: 400 })
    }

    return NextResponse.json({ success: true, updated: result.updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update display rules' },
      { status: 500 }
    )
  }
}
