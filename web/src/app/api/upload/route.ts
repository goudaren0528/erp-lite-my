import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  const data = await request.formData()
  const file: File | null = data.get('file') as unknown as File

  if (!file) {
    return NextResponse.json({ success: false, message: 'No file uploaded' })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Create a unique filename
  const filename = `${Date.now()}-${file.name.replace(/\s/g, '-')}`
  const uploadDir = path.join(process.cwd(), 'public/uploads')
  const filepath = path.join(uploadDir, filename)

  try {
    await writeFile(filepath, buffer)
    return NextResponse.json({ success: true, url: `/uploads/${filename}` })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ success: false, message: 'Upload failed' })
  }
}
