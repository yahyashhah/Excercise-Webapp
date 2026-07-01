import { S3Client } from "@aws-sdk/client-s3"

export const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME!
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!

let _r2: S3Client | null = null

export function getR2Client(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
      // AWS SDK v3 adds CRC32 checksums by default; R2 presigned PUTs fail when
      // the checksum is pre-calculated for an empty body but the actual file isn't empty.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  }
  return _r2
}
