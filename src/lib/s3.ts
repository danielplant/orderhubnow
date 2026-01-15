import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const bucket = process.env.AWS_S3_BUCKET_NAME
const region = process.env.AWS_REGION || 'us-east-1'

// S3 client - uses IAM instance role on EC2, or access keys from env
const s3Client = new S3Client({
  region,
  // Credentials are automatically resolved from:
  // 1. IAM instance role (on EC2)
  // 2. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 3. AWS credentials file (~/.aws/credentials)
})

/**
 * Upload a file to S3
 * @param buffer - File buffer to upload
 * @param key - S3 key (path) e.g., 'uploads/collections/collection-1.jpg'
 * @param contentType - MIME type e.g., 'image/jpeg'
 * @returns Public URL of the uploaded file
 */
export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set')
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })

  await s3Client.send(command)

  // Return public URL
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Delete a file from S3
 * @param key - S3 key (path) to delete
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set')
  }

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  await s3Client.send(command)
}

/**
 * Extract S3 key from a full S3 URL
 * @param url - Full S3 URL
 * @returns S3 key or null if not an S3 URL
 */
export function getKeyFromS3Url(url: string): string | null {
  if (!bucket) return null

  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length)
  }
  return null
}

/**
 * Fetch a file from S3 as a Buffer
 * @param key - S3 key (path) to fetch
 * @returns Buffer or null if file doesn't exist
 */
export async function getFromS3(key: string): Promise<Buffer | null> {
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set')
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    const response = await s3Client.send(command)

    if (!response.Body) return null

    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch (error) {
    // Return null for missing files (NoSuchKey)
    if ((error as { name?: string }).name === 'NoSuchKey') {
      return null
    }
    throw error
  }
}
