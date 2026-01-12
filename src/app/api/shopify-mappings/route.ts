import { getShopifyMappings } from '@/lib/data/queries/collections'
import type { MappingStatus } from '@/lib/types/collection'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status')

    let status: MappingStatus | undefined
    if (statusParam && ['mapped', 'unmapped', 'deferred'].includes(statusParam)) {
      status = statusParam as MappingStatus
    }

    const mappings = await getShopifyMappings(status)
    return Response.json(mappings)
  } catch {
    return Response.json({ error: 'Failed to fetch mappings' }, { status: 500 })
  }
}
