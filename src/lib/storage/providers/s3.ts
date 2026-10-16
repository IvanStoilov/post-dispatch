import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireConfig } from "../../config";
import type { StorageProvider } from "../types";

let cached: { configuration: string; client: S3Client } | undefined;

export function s3Client() {
  const endpoint = requireConfig("AWS_ENDPOINT_URL_S3"),
    region = requireConfig("AWS_REGION");
  const accessKeyId = requireConfig("AWS_ACCESS_KEY_ID"),
    secretAccessKey = requireConfig("AWS_SECRET_ACCESS_KEY");
  const configuration = JSON.stringify([
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
  ]);
  if (cached?.configuration !== configuration) {
    cached?.client.destroy();
    cached = {
      configuration,
      client: new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }
  return cached.client;
}

export const s3Provider: StorageProvider = {
  name: "s3",
  get bucket() {
    return requireConfig("AWS_S3_BUCKET");
  },
  async getAssetUrl({ bucket, key }, expiresIn = 3600) {
    return getSignedUrl(
      s3Client(),
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn },
    );
  },
  async createUploadUrl({ bucket, key, mimeType, fileSize }) {
    return getSignedUrl(
      s3Client(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: fileSize,
      }),
      { expiresIn: 600 },
    );
  },
  async write(object, bytes, contentType) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "private, max-age=0",
      }),
    );
  },
  async read(object, maxBytes) {
    const response = await s3Client().send(
      new GetObjectCommand({ Bucket: object.bucket, Key: object.key }),
      { abortSignal: AbortSignal.timeout(120000) },
    );
    if (!response.Body) {
      throw new Error("Stored file not found");
    }
    if (
      response.ContentLength !== undefined &&
      response.ContentLength > maxBytes
    ) {
      await response.Body.transformToWebStream().cancel();
      throw new Error("Stored file exceeds its size limit");
    }
    const reader = response.Body.transformToWebStream().getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        length += value.length;
        if (length > maxBytes) {
          await reader.cancel();
          throw new Error("Stored file exceeds its size limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  },
  async delete(bucket, keys) {
    if (keys.length === 1) {
      await s3Client().send(
        new DeleteObjectCommand({ Bucket: bucket, Key: keys[0] }),
      );
      return;
    }
    for (let start = 0; start < keys.length; start += 200) {
      const result = await s3Client().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.slice(start, start + 200).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      if (result.Errors?.length) {
        throw new Error("Some stored files could not be removed");
      }
    }
  },
  async list(bucket, prefix, limit) {
    const result = await s3Client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: limit,
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    return {
      keys:
        result.Contents?.flatMap((object) =>
          object.Key ? [object.Key] : [],
        ) || [],
      truncated: result.IsTruncated ?? false,
    };
  },
};
