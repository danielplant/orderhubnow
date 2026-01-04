import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

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

    const dir = path.join(process.cwd(), 'public', 'SkuImages')
    await mkdir(dir, { recursive: true })

    const out = path.join(dir, `${categoryId}.jpg`)
    await writeFile(out, buffer)

    return Response.json({ success: true, imageUrl: `/SkuImages/${categoryId}.jpg` })
  } catch {
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

    const out = path.join(process.cwd(), 'public', 'SkuImages', `${categoryId}.jpg`)
    try {
      await unlink(out)
    } catch {
      // Ignore if file doesn't exist
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
