import { Readable } from 'node:stream'
import { GetObjectCommand, PutObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: 'https://fsn1.your-objectstorage.com',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
})

export async function uploadImageToSpaces(params: {
  fileBuffer: Buffer
  fileName: string
  mimeType: string
  bucket: string
  folder?: string
}): Promise<string> {
  const key = `${params.folder ?? ''}/${params.fileName}`

  const commandInput: PutObjectCommandInput = {
    Bucket: params.bucket,
    Key: key,
    Body: params.fileBuffer,
    ContentType: params.mimeType,
    ACL: 'public-read',
  }

  await s3.send(new PutObjectCommand(commandInput))

  return `https://${params.bucket}.fsn1.your-objectstorage.com/${key}`
}

export async function uploadJsonToSpaces(params: {
  data: any
  fileName: string
  bucket: string
  folder?: string
}): Promise<string> {
  const key = `${params.folder ?? ''}/${params.fileName}`

  const jsonString = JSON.stringify(params.data, null, 2)
  const buffer = Buffer.from(jsonString, 'utf-8')

  const commandInput: PutObjectCommandInput = {
    Bucket: params.bucket,
    Key: key,
    Body: buffer,
    ContentType: 'application/json',
    ACL: 'public-read',
  }

  await s3.send(new PutObjectCommand(commandInput))

  return `https://${params.bucket}.fra1.digitaloceanspaces.com/${key}`
}

async function streamToBuffer(stream: Readable | any): Promise<Buffer> {
  const chunks: any[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// Метод для получения файла из S3 / Spaces
export async function downloadFromSpaces(params: { bucket: string; key: string }): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  })

  const data = await s3.send(command)
  if (!data.Body) throw new Error('No body returned from S3')

  return streamToBuffer(data.Body)
}
