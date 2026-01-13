import { prisma } from '@/lib/prisma'
import { uploadToS3, deleteFromS3, getKeyFromS3Url } from '@/lib/s3'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  console.log('[S3 Upload] Starting collection image upload...')
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    console.log('[S3 Upload] Collection ID:', collectionId)

    if (Number.isNaN(collectionId)) {
      console.log('[S3 Upload] Invalid collection ID')
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Verify collection exists
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    })
    if (!collection) {
      console.log('[S3 Upload] Collection not found')
      return Response.json({ error: 'Collection not found' }, { status: 404 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      console.log('[S3 Upload] No file in request')
      return Response.json({ error: 'Missing file' }, { status: 400 })
    }

    console.log('[S3 Upload] File received:', file.name, file.type, file.size, 'bytes')

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Determine content type
    const contentType = file.type || 'image/jpeg'
    const extension = contentType.split('/')[1] || 'jpg'

    // Upload to S3
    const key = `uploads/collections/collection-${collectionId}.${extension}`
    console.log('[S3 Upload] Uploading to S3:', key)

    const imageUrl = await uploadToS3(buffer, key, contentType)
    console.log('[S3 Upload] Success! URL:', imageUrl)

    // Update collection with new image URL
    await prisma.collection.update({
      where: { id: collectionId },
      data: { imageUrl },
    })

    return Response.json({ success: true, imageUrl })
  } catch (error) {
    console.error('[S3 Upload] ERROR:', error)
    return Response.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Get current image URL
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { imageUrl: true },
    })

    if (collection?.imageUrl) {
      // Extract S3 key from URL and delete
      const key = getKeyFromS3Url(collection.imageUrl)
      if (key) {
        try {
          await deleteFromS3(key)
        } catch {
          // Ignore if file doesn't exist in S3
        }
      }
    }

    // Clear image URL in database
    await prisma.collection.update({
      where: { id: collectionId },
      data: { imageUrl: null },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('Failed to delete collection image:', error)
    return Response.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
