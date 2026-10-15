import { loggedOperation } from "./logger";
import { storageProvider, newStorageLocation } from "./storage/index";
import type { StorageLocation } from "./storage/types";
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
  return loggedOperation("lib.storage.downloadImage", {}, async () => {
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
            "User-Agent": "Ramblo/1.0",
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
  });
}
export async function uploadImage(
  projectId: string,
  input: { imageUrl?: string; imageFile?: z.infer<typeof imageFileSchema> },
) {
  return loggedOperation("lib.storage.uploadImage", { projectId }, async () => {
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
  });
}
export async function storeImage(
  projectId: string,
  bytes: Buffer,
  provider?: StorageLocation["storageProvider"],
) {
  return loggedOperation("lib.storage.storeImage", { projectId }, async () => {
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
    const location = { ...(await newStorageLocation(provider)), imageKey };
    await storageProvider(location.storageProvider).write(
      { bucket: location.imageBucket, key: imageKey },
      jpeg,
      "image/jpeg",
    );
    return location;
  });
}
export async function removeImage(image: {
  imageKey: string | null;
  imageBucket: string | null;
  storageProvider: StorageLocation["storageProvider"];
}) {
  return loggedOperation("lib.storage.removeImage", {}, async () => {
    if (image.imageKey && image.imageBucket)
      await storageProvider(image.storageProvider).delete(image.imageBucket, [
        image.imageKey,
      ]);
  });
}
export async function purgeProjectMedia(target: {
  bucket: string;
  prefix: string;
  objectKeys: string[];
  storageProvider: StorageLocation["storageProvider"];
}) {
  if (!/^[a-f0-9-]{36}\/$/i.test(target.prefix))
    throw new Error("Invalid project media prefix");
  const provider = storageProvider(target.storageProvider);
  await provider.delete(target.bucket, target.objectKeys);
  for (let page = 0; page < 5; page++) {
    const result = await provider.list(target.bucket, target.prefix, 200);
    await provider.delete(target.bucket, result.keys);
    if (!result.truncated) return true;
  }
  return false;
}
export async function readImage(image: StorageLocation) {
  return loggedOperation("lib.storage.readImage", {}, () =>
    storageProvider(image.storageProvider).read(
      { bucket: image.imageBucket, key: image.imageKey },
      MAX_VIDEO_BYTES,
    ),
  );
}
export async function getAssetUrl(image: StorageLocation, expiresIn = 3600) {
  return loggedOperation("lib.storage.getAssetUrl", {}, () =>
    storageProvider(image.storageProvider).getAssetUrl(
      { bucket: image.imageBucket, key: image.imageKey },
      expiresIn,
    ),
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
  provider?: StorageLocation["storageProvider"],
): Promise<StoredAsset> {
  return loggedOperation("lib.storage.storeAsset", { projectId }, async () => {
    const kind = isMp4(bytes) ? "VIDEO" : "IMAGE";
    if (expectedKind && expectedKind !== kind)
      throw new Error(`Expected a valid ${expectedKind.toLowerCase()} file`);
    const id = randomUUID();
    if (kind === "IMAGE")
      return {
        id,
        kind,
        mimeType: "image/jpeg",
        ...(await storeImage(projectId, bytes, provider)),
      };
    if (bytes.length > MAX_VIDEO_BYTES)
      throw new Error("Video must be 100 MB or smaller");
    const imageKey = `${projectId}/${id}.mp4`;
    const location = { ...(await newStorageLocation(provider)), imageKey };
    await storageProvider(location.storageProvider).write(
      { bucket: location.imageBucket, key: imageKey },
      bytes,
      "video/mp4",
    );
    return { id, kind, ...location, mimeType: "video/mp4" };
  });
}
export async function downloadAsset(
  projectId: string,
  url: string,
  kind?: AssetKind,
  deadline = Date.now() + (kind === "IMAGE" ? 20000 : 120000),
) {
  return loggedOperation(
    "lib.storage.downloadAsset",
    { projectId },
    async () => {
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
    },
  );
}
export async function readStagedUpload(
  asset: StorageLocation & { fileSize: number },
) {
  if (asset.fileSize > MAX_VIDEO_BYTES)
    throw new Error("Uploaded file exceeds its size limit");
  const bytes = await storageProvider(asset.storageProvider).read(
    { bucket: asset.imageBucket, key: asset.imageKey },
    asset.fileSize,
  );
  if (bytes.length !== asset.fileSize)
    throw new Error("Uploaded file size does not match the upload request");
  return bytes;
}
