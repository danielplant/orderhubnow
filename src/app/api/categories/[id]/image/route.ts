import { uploadToS3, deleteFromS3 } from '@/lib/s3'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const categoryId = parseInt(id)
    if (Number.isNaN(categoryId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'Missing file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Determine content type
    const contentType = file.type || 'image/jpeg'
    const extension = contentType.split('/')[1] || 'jpg'

    // Upload to S3
    const key = `uploads/categories/category-${categoryId}.${extension}`
    const imageUrl = await uploadToS3(buffer, key, contentType)

    return Response.json({ success: true, imageUrl })
  } catch (error) {
    console.error('Failed to upload category image:', error)
    return Response.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const categoryId = parseInt(id)
    if (Number.isNaN(categoryId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Try to delete common extensions
    const extensions = ['jpg', 'jpeg', 'png', 'webp']
    for (const ext of extensions) {
      try {
        await deleteFromS3(`uploads/categories/category-${categoryId}.${ext}`)
      } catch {
        // Ignore if file doesn't exist
      }
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Failed to delete category image:', error)
    return Response.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
