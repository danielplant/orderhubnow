import { prisma } from '../src/lib/prisma'
import { extractCacheKey, getThumbnailUrl } from '../src/lib/utils/thumbnails'

async function checkThumbnails() {
  // Check specific SKUs or get a sample
  const skus = await prisma.sku.findMany({
    where: {
      SkuID: {
        in: ['2PC-581P-BO-M/L', '700S-CP-6/12M']
      }
    },
    select: {
      SkuID: true,
      ThumbnailPath: true,
      ShopifyImageURL: true,
    }
  })

  console.log('\n=== Thumbnail Check ===\n')
  
  for (const sku of skus) {
    console.log(`SKU: ${sku.SkuID}`)
    console.log(`  ThumbnailPath: ${sku.ThumbnailPath || '(null)'}`)
    console.log(`  ShopifyImageURL: ${sku.ShopifyImageURL?.substring(0, 60) || '(null)'}...`)
    
    const cacheKey = extractCacheKey(sku.ThumbnailPath)
    console.log(`  Extracted cacheKey: ${cacheKey || '(null - format not recognized)'}`)
    
    if (cacheKey) {
      const s3Url = getThumbnailUrl(cacheKey, 'sm')
      console.log(`  Generated S3 URL: ${s3Url}`)
    }
    console.log('')
  }

  await prisma.$disconnect()
}

checkThumbnails().catch(console.error)