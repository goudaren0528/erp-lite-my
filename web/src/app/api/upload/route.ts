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

  // Create a unique filename with ASCII characters only
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  const ext = path.extname(file.name)
  const filename = `${timestamp}-${random}${ext}`
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
