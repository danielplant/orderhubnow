import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { uploadToS3, deleteFromS3, getKeyFromS3Url } from '@/lib/s3'

const MAX_FILE_SIZE = 500 * 1024 // 500KB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use PNG, JPG, SVG, or WebP.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 500KB.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Determine extension from content type
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    }
    const extension = extMap[file.type] || 'png'

    // Delete old logo if exists
    const existing = await prisma.companySettings.findFirst()
    if (existing?.LogoUrl) {
      const oldKey = getKeyFromS3Url(existing.LogoUrl)
      if (oldKey) {
        try {
          await deleteFromS3(oldKey)
        } catch {
          // Ignore deletion errors
        }
      }
    }

    // Upload new logo
    const key = `uploads/company/logo.${extension}`
    const logoUrl = await uploadToS3(buffer, key, file.type)

    // Update or create company settings
    if (existing) {
      await prisma.companySettings.update({
        where: { ID: existing.ID },
        data: { LogoUrl: logoUrl },
      })
    } else {
      await prisma.companySettings.create({
        data: {
          CompanyName: 'Company Name',
          LogoUrl: logoUrl,
        },
      })
    }

    return NextResponse.json({ success: true, logoUrl })
  } catch (error) {
    console.error('Logo upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.companySettings.findFirst()
    if (!existing?.LogoUrl) {
      return NextResponse.json({ success: true })
    }

    // Delete from S3
    const key = getKeyFromS3Url(existing.LogoUrl)
    if (key) {
      try {
        await deleteFromS3(key)
      } catch {
        // Ignore deletion errors
      }
    }

    // Clear LogoUrl in database
    await prisma.companySettings.update({
      where: { ID: existing.ID },
      data: { LogoUrl: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logo delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    )
  }
}
