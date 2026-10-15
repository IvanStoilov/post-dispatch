export type StorageProviderName = "local" | "s3";
export type StorageLocation = {
  storageProvider: StorageProviderName;
  imageBucket: string;
  imageKey: string;
};
export type ObjectReference = { bucket: string; key: string };
/** Providers handle file I/O and storage URLs; media validation stays outside. */
export interface StorageProvider {
  name: StorageProviderName;
  bucket: string;
  getAssetUrl(object: ObjectReference, expiresIn?: number): Promise<string>;
  createUploadUrl(
    input: ObjectReference & {
      uploadId: string;
      mimeType: string;
      fileSize: number;
    },
  ): Promise<string>;
  write(
    object: ObjectReference,
    bytes: Buffer,
    contentType: string,
  ): Promise<void>;
  read(object: ObjectReference, maxBytes: number): Promise<Buffer>;
  delete(bucket: string, keys: string[]): Promise<void>;
  list(
    bucket: string,
    prefix: string,
    limit: number,
  ): Promise<{ keys: string[]; truncated: boolean }>;
}
