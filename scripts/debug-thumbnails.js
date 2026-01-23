const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function step2() {
  // Count: SKUs with a Shopify image URL
  const withImage = await prisma.sku.count({
    where: { ShopifyImageURL: { not: null } }
  });

  // Count: SKUs with ThumbnailPath set (already have thumbnails)
  const withThumbnail = await prisma.sku.count({
    where: {
      ShopifyImageURL: { not: null },
      ThumbnailPath: { not: null }
    }
  });

  // Count: SKUs needing thumbnails (have image but no thumbnail)
  const needsThumbnail = withImage - withThumbnail;

  console.log('SKUs with ShopifyImageURL:', withImage);
  console.log('SKUs with ThumbnailPath (have thumbnails):', withThumbnail);
  console.log('SKUs needing thumbnails:', needsThumbnail);

  await prisma.$disconnect();
}

step2().catch(console.error);
