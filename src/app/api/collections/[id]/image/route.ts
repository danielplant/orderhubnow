import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Verify collection exists
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    })
    if (!collection) {
      return Response.json({ error: 'Collection not found' }, { status: 404 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'Missing file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Store in same location as category images for compatibility
    const dir = path.join(process.cwd(), 'public', 'SkuImages')
    await mkdir(dir, { recursive: true })

    const filename = `collection-${collectionId}.jpg`
    const out = path.join(dir, filename)
    await writeFile(out, buffer)

    const imageUrl = `/SkuImages/${filename}`

    // Update collection with new image URL
    await prisma.collection.update({
      where: { id: collectionId },
      data: { imageUrl },
    })

    return Response.json({ success: true, imageUrl })
  } catch {
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
      // Extract filename from URL
      const filename = collection.imageUrl.split('/').pop()
      if (filename) {
        const out = path.join(process.cwd(), 'public', 'SkuImages', filename)
        try {
          await unlink(out)
        } catch {
          // Ignore if file doesn't exist
        }
      }
    }

    // Clear image URL in database
    await prisma.collection.update({
      where: { id: collectionId },
      data: { imageUrl: null },
    })

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
