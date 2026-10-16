import { config } from "../config";
import { localProvider } from "./providers/local";
import { s3Provider } from "./providers/s3";
import type { StorageProviderName, StorageProvider } from "./types";

export type {
  StorageProviderName,
  StorageProvider,
  StorageLocation,
} from "./types";

export function storageProvider(
  name: StorageProviderName = config.STORAGE_PROVIDER,
): StorageProvider {
  if (name === "local") {
    if (config.NODE_ENV === "production" || config.VERCEL === "1") {
      throw new Error(
        "Local storage is only available in development and tests",
      );
    }
    return localProvider(config.LOCAL_STORAGE_PATH);
  }
  if (name === "s3") {
    return s3Provider;
  }
  throw new Error("Unknown storage provider");
}

export async function newStorageLocation(
  name: StorageProviderName = config.STORAGE_PROVIDER,
) {
  const provider = storageProvider(name);

  return {
    storageProvider: provider.name,
    imageBucket: provider.bucket,
  };
}
