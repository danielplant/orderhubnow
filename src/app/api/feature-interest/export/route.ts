import { NextRequest, NextResponse } from 'next/server'
import { getFeatureInterestList } from '@/lib/data/queries/feature-interest'
import { auth } from '@/lib/auth/providers'

export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const feature = searchParams.get('feature') || undefined

  const entries = await getFeatureInterestList(feature)

  // Build CSV
  const headers = ['Feature', 'User', 'Selected Options', 'Comments', 'Order Number', 'Date']
  const rows = entries.map((e) => [
    e.feature,
    e.userId || '',
    e.selectedOptions.join('; '),
    (e.freeText || '').replace(/"/g, '""'),
    e.orderNumber || '',
    new Date(e.createdAt).toISOString(),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${cell}"`).join(',')
    ),
  ].join('\n')

  const filename = feature
    ? `feature-interest-${feature.toLowerCase().replace(/\s+/g, '-')}.csv`
    : 'feature-interest-all.csv'

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
