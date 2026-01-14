/**
 * User Preferences API
 * GET - Retrieve current user's preferences
 * POST - Update a preference (partial update via dot notation key)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

// Default preferences structure
const DEFAULT_PREFERENCES = {
  collections: {
    hideEmpty: true,
  },
}

type PreferencesObject = Record<string, unknown>

function parsePreferences(json: string | null): PreferencesObject {
  if (!json) return { ...DEFAULT_PREFERENCES }
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(json) }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function setNestedValue(obj: PreferencesObject, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as PreferencesObject
  }
  current[keys[keys.length - 1]] = value
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.users.findUnique({
      where: { ID: parseInt(String(session.user.id)) },
      select: { Preferences: true },
    })

    const preferences = parsePreferences(user?.Preferences ?? null)
    return NextResponse.json(preferences)
  } catch (error) {
    console.error('Error fetching preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    const userId = parseInt(String(session.user.id))

    // Get current preferences
    const user = await prisma.users.findUnique({
      where: { ID: userId },
      select: { Preferences: true },
    })

    const preferences = parsePreferences(user?.Preferences ?? null)
    
    // Update the nested value
    setNestedValue(preferences, key, value)

    // Save back to database
    await prisma.users.update({
      where: { ID: userId },
      data: { Preferences: JSON.stringify(preferences) },
    })

    return NextResponse.json(preferences)
  } catch (error) {
    console.error('Error updating preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
