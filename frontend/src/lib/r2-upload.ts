import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (cachedClient) return cachedClient;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("Missing R2 env vars (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_URL)");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return cachedClient;
}

export function publicUrlFor(r2Key: string): string {
  if (!R2_PUBLIC_URL) throw new Error("Missing R2_PUBLIC_URL");
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

export async function objectExists(r2Key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: r2Key }));
    return true;
  } catch {
    return false;
  }
}

export async function processAndUpload(buffer: Buffer, r2Key: string): Promise<string> {
  const resized = await sharp(buffer)
    .resize(500, 500, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await client().send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    Body: resized,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicUrlFor(r2Key);
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_BYTES = 20 * 1024 * 1024; // 20 MB

/** Reject loopback, RFC1918, link-local (incl. 169.254.169.254), and similar hosts. */
function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // IPv6 literal (URL.hostname strips the brackets)
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fe80") || // link-local
      host.startsWith("fc") || // unique-local fc00::/7
      host.startsWith("fd") ||
      host.startsWith("::ffff:") // IPv4-mapped
    );
  }
  // IPv4 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

export async function fetchAndUpload(sourceUrl: string, r2Key: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("Invalid source URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https:// source URLs are allowed");
  }
  if (isForbiddenHost(url.hostname)) {
    throw new Error("Source URL host is not allowed");
  }

  const resp = await fetch(sourceUrl, {
    headers: { "User-Agent": "lens-db-image-upload/1.0 (https://lens-db.com)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`fetch ${sourceUrl} -> ${resp.status}`);

  const contentLength = Number(resp.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FETCH_BYTES) {
    throw new Error(`Source exceeds ${MAX_FETCH_BYTES} byte limit`);
  }

  if (!resp.body) throw new Error("Empty response body");
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FETCH_BYTES) {
      await reader.cancel();
      throw new Error(`Source exceeds ${MAX_FETCH_BYTES} byte limit`);
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  return processAndUpload(buffer, r2Key);
}
