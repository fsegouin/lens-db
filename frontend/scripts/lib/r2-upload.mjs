import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  throw new Error("Missing R2 env vars");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

export const R2_PUBLIC = R2_PUBLIC_URL;

export function publicUrlFor(r2Key) {
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

export async function objectExists(r2Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: r2Key }));
    return true;
  } catch { return false; }
}

export async function processAndUpload(buffer, r2Key) {
  const resized = await sharp(buffer)
    .resize(500, 500, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME, Key: r2Key, Body: resized,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicUrlFor(r2Key);
}

export async function fetchAndUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl, {
    headers: { "User-Agent": "lens-db-image-upload/1.0 (https://lens-db.com)" },
  });
  if (!resp.ok) throw new Error(`fetch ${sourceUrl} -> ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}
