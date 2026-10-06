import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import sharp from "sharp";
import { z } from "zod";
import type { StoredAsset, AssetKind } from "./types";
export const MAX_VIDEO_BYTES = 100_000_000;

// Vercel rejects function request bodies over 4.5 MB before our code runs.
export const MAX_IMAGE_BYTES = 4_500_000;
export const MAX_IMAGE_LABEL = "4.5 MB";
export const IMAGE_TOO_LARGE = `Images must be ${MAX_IMAGE_LABEL} or smaller. Resize to at most 2048 px on the long edge (images are stored at up to 1440×1800) and try again.`;
export const imageFileSchema = z.object({
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
});
// Inline base64 makes the model emit every byte as output tokens, so MCP only
// accepts it for small images; larger ones go through create_upload_token.
export const MAX_INLINE_IMAGE_BYTES = 256 * 1024;
export const inlineImageFileSchema = imageFileSchema.extend({
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4),
});
let client: S3Client | undefined;
let discoveredBucket: Promise<string> | undefined;
export function storage() {
  if (
    !process.env.AWS_ENDPOINT_URL_S3 ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.AWS_REGION
  )
    throw new Error("Image storage is not configured");
  return (client ??= new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
  }));
}
export async function bucket() {
  if (process.env.AWS_S3_BUCKET) return process.env.AWS_S3_BUCKET;
  if (!discoveredBucket)
    discoveredBucket = storage()
      .send(new ListBucketsCommand({}))
      .then((r) => {
        if (r.Buckets?.length !== 1 || !r.Buckets[0].Name)
          throw new Error("Set AWS_S3_BUCKET to the image bucket name");
        return r.Buckets[0].Name;
      })
      .catch((e) => {
        discoveredBucket = undefined;
        throw e;
      });
  return discoveredBucket;
}
export function assertPublicAddress(address: string) {
  const parsed = ipaddr.process(address);
  if (parsed.range() !== "unicast")
    throw new Error("Image URLs must resolve to a public internet address");
}
export async function downloadImage(
  value: string,
  redirects = 0,
  deadline = Date.now() + 20000,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<Buffer> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Use a public HTTPS image URL on port 443");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length) throw new Error("Image host could not be resolved");
  addresses.forEach((a) => assertPublicAddress(a.address));
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Image download timed out");
  return new Promise((resolve, reject) => {
    const chosen = addresses[0];
    const req = request(
      url,
      {
        signal: AbortSignal.timeout(remaining),
        headers: {
          Accept: "image/*,video/mp4",
          "User-Agent": "PostDispatch/1.0",
        },
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [chosen]);
          else callback(null, chosen.address, chosen.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          if (redirects >= 3 || !response.headers.location)
            return reject(new Error("Too many image redirects"));
          try {
            downloadImage(
              new URL(response.headers.location, url).href,
              redirects + 1,
              deadline,
              maxBytes,
            ).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status !== 200) {
          response.destroy();
          reject(new Error(`Image download failed (HTTP ${status})`));
          return;
        }
        if (Number(response.headers["content-length"] || 0) > maxBytes) {
          response.destroy();
          reject(
            new Error(
              maxBytes === MAX_IMAGE_BYTES
                ? IMAGE_TOO_LARGE
                : "Video must be 100 MB or smaller",
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) {
            response.destroy(
              new Error(
                maxBytes === MAX_IMAGE_BYTES
                  ? IMAGE_TOO_LARGE
                  : "Video must be 100 MB or smaller",
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}
export async function uploadImage(
  projectId: string,
  input: { imageUrl?: string; imageFile?: z.infer<typeof imageFileSchema> },
) {
  let bytes: Buffer;
  if (input.imageFile) {
    const value = input.imageFile.dataBase64;
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        value,
      )
    )
      throw new Error(
        "imageFile.dataBase64 must contain valid base64 file bytes",
      );
    bytes = Buffer.from(value, "base64");
  } else bytes = await downloadImage(input.imageUrl!);
  return storeImage(projectId, bytes);
}
export async function storeImage(projectId: string, bytes: Buffer) {
  if (!bytes.length) throw new Error("The image is empty");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(IMAGE_TOO_LARGE);
  let jpeg: Buffer;
  try {
    const image = sharp(bytes, {
      limitInputPixels: 20_000_000,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("Unsupported image");
    jpeg = await image
      .rotate()
      .resize({
        width: 1440,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    if (jpeg.length > MAX_IMAGE_BYTES) throw new Error("Image too large");
  } catch {
    throw new Error(
      "Upload a valid JPEG, PNG, or WebP image (maximum 20 megapixels)",
    );
  }
  const imageKey = `${projectId}/${randomUUID()}.jpg`;
  const imageBucket = await bucket();
  await storage().send(
    new PutObjectCommand({
      Bucket: imageBucket,
      Key: imageKey,
      Body: jpeg,
      ContentType: "image/jpeg",
      CacheControl: "private, max-age=0",
    }),
  );
  return { imageKey, imageBucket };
}
export async function removeImage(image: {
  imageKey: string | null;
  imageBucket: string | null;
}) {
  if (image.imageKey && image.imageBucket)
    await storage().send(
      new DeleteObjectCommand({
        Bucket: image.imageBucket,
        Key: image.imageKey,
      }),
    );
}
export async function readImage(image: {
  imageKey: string;
  imageBucket: string;
}) {
  const r = await storage().send(
    new GetObjectCommand({ Bucket: image.imageBucket, Key: image.imageKey }),
  );
  if (!r.Body) throw new Error("Image not found");
  return r.Body.transformToByteArray();
}
export async function publicationImageUrl(
  image: {
    imageKey: string;
    imageBucket: string;
  },
  expiresIn = 3600,
) {
  return getSignedUrl(
    storage(),
    new GetObjectCommand({ Bucket: image.imageBucket, Key: image.imageKey }),
    { expiresIn },
  );
}

// Check the ISO-BMFF structure rather than trusting a MIME type or extension.
// Meta performs final codec, duration and aspect-ratio validation on publication.
export function isMp4(bytes: Buffer) {
  let offset = 0;
  const boxes = new Set<string>();
  while (offset + 8 <= bytes.length) {
    let length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (length === 1) {
      if (offset + 16 > bytes.length) return false;
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(bytes.length)) return false;
      length = Number(large);
      if (length < 16) return false;
    } else if (length === 0) length = bytes.length - offset;
    if (length < 8 || offset + length > bytes.length) return false;
    if (type === "ftyp" && length < 16) return false;
    if (type === "moov" && length < 16) return false;
    boxes.add(type);
    offset += length;
  }
  return (
    offset === bytes.length &&
    ["ftyp", "moov", "mdat"].every((box) => boxes.has(box))
  );
}
export async function storeAsset(
  projectId: string,
  bytes: Buffer,
  expectedKind?: AssetKind,
): Promise<StoredAsset> {
  const kind = isMp4(bytes) ? "VIDEO" : "IMAGE";
  if (expectedKind && expectedKind !== kind)
    throw new Error(`Expected a valid ${expectedKind.toLowerCase()} file`);
  const id = randomUUID();
  if (kind === "IMAGE")
    return {
      id,
      kind,
      mimeType: "image/jpeg",
      ...(await storeImage(projectId, bytes)),
    };
  if (bytes.length > MAX_VIDEO_BYTES)
    throw new Error("Video must be 100 MB or smaller");
  const imageKey = `${projectId}/${id}.mp4`;
  const imageBucket = await bucket();
  await storage().send(
    new PutObjectCommand({
      Bucket: imageBucket,
      Key: imageKey,
      Body: bytes,
      ContentType: "video/mp4",
      CacheControl: "private, max-age=0",
    }),
  );
  return { id, kind, imageKey, imageBucket, mimeType: "video/mp4" };
}
export async function downloadAsset(
  projectId: string,
  url: string,
  kind?: AssetKind,
  deadline = Date.now() + (kind === "IMAGE" ? 20000 : 120000),
) {
  return storeAsset(
    projectId,
    await downloadImage(
      url,
      0,
      deadline,
      kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES,
    ),
    kind,
  );
}
export async function stagedUploadUrl(
  projectId: string,
  mimeType: string,
  fileSize: number,
) {
  const imageKey = `${projectId}/pending/${randomUUID()}`;
  const imageBucket = await bucket();
  const uploadUrl = await getSignedUrl(
    storage(),
    new PutObjectCommand({
      Bucket: imageBucket,
      Key: imageKey,
      ContentType: mimeType,
      ContentLength: fileSize,
    }),
    { expiresIn: 600 },
  );
  return { imageKey, imageBucket, uploadUrl };
}
export async function readStagedUpload(asset: {
  imageKey: string;
  imageBucket: string;
  fileSize: number;
}) {
  const head = await storage().send(
    new HeadObjectCommand({ Bucket: asset.imageBucket, Key: asset.imageKey }),
  );
  if (
    head.ContentLength !== asset.fileSize ||
    head.ContentLength > MAX_VIDEO_BYTES
  )
    throw new Error("Uploaded file size does not match the upload request");
  const response = await storage().send(
    new GetObjectCommand({ Bucket: asset.imageBucket, Key: asset.imageKey }),
    { abortSignal: AbortSignal.timeout(120000) },
  );
  if (!response.Body) throw new Error("Uploaded file is unavailable");
  const reader = response.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (response.ContentLength !== asset.fileSize) {
      await reader.cancel();
      throw new Error("Uploaded file changed during verification");
    }
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > asset.fileSize) {
        await reader.cancel();
        throw new Error("Uploaded file changed during verification");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== asset.fileSize)
    throw new Error("Uploaded file changed during verification");
  return Buffer.concat(chunks);
}
