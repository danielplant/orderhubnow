import { getMappingStats } from '@/lib/data/queries/collections'

export async function GET() {
  try {
    const stats = await getMappingStats()
    return Response.json(stats)
  } catch {
    return Response.json({ error: 'Failed to fetch mapping stats' }, { status: 500 })
  }
}
