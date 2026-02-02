
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 Client for Cloudflare R2 (Same configuration as upload)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    
    // Check if R2 is configured
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      console.error('R2 configuration missing');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    // Reconstruct the key from path segments (e.g., ['order-pic', 'image.jpg'] -> 'order-pic/image.jpg')
    const key = pathSegments.join('/');

    // Security check: ensure key doesn't try to escape bucket
    if (key.includes('..')) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    try {
      // Get the object from R2
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      
      if (!response.Body) {
        return new NextResponse('File not found', { status: 404 });
      }

      // Convert the stream to a Web Response
      // Note: response.Body is a readable stream in Node environment
      const webStream = response.Body.transformToWebStream();

      return new NextResponse(webStream, {
        headers: {
          'Content-Type': response.ContentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return new NextResponse('File not found', { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error serving file from R2:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
