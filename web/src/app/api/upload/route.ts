import { NextResponse } from 'next/server'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Initialize S3 Client for Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
})

export async function POST(request: Request) {
  const data = await request.formData()
  const file: File | null = data.get('file') as unknown as File

  if (!file) {
    return NextResponse.json({ success: false, message: 'No file uploaded' })
  }

  // Check if R2 is configured
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error('R2 configuration missing')
    return NextResponse.json({ success: false, message: 'Server configuration error' })
  }

  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Create a unique filename
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    const ext = path.extname(file.name)
    const filename = `${timestamp}-${random}${ext}`
    
    // Key (path) in the bucket
    // Note: The user provided https://.../erp-storage/order-pic/
    // So we should store under 'order-pic/' folder
    const key = `order-pic/${filename}`

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })

    await s3Client.send(command)

    // Return the local proxy URL instead of R2 public URL
    // This allows serving images without exposing the bucket publicly
    const fileUrl = `/uploads/${key}`

    return NextResponse.json({ success: true, url: fileUrl })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ success: false, message: 'Upload failed' })
  }
}
