import {
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  rmdir,
} from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname, relative, sep, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider } from "../types";
import { appOrigin } from "../../origins";

export function localProvider(directory: string): StorageProvider {
  const root = resolve(directory);
  function file(bucket: string, key: string) {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(bucket) ||
      !key ||
      key.includes("\\") ||
      key.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Invalid local storage path");
    }
    const path = resolve(root, bucket, key);
    if (
      relative(root, path).startsWith(`..${sep}`) ||
      path === root ||
      !path.startsWith(root + sep)
    ) {
      throw new Error("Invalid local storage path");
    }
    return path;
  }
  async function safe(path: string) {
    const actual = await realpath(path),
      actualRoot = await realpath(root);
    if (actual !== actualRoot && !actual.startsWith(actualRoot + sep)) {
      throw new Error(
        "Local storage symlinks must not escape the storage directory",
      );
    }
    return actual;
  }
  async function ensureDirectory(path: string) {
    await mkdir(root, { recursive: true });
    let current = root;
    for (const part of relative(root, path).split(sep).filter(Boolean)) {
      current = join(current, part);
      try {
        await mkdir(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("Local storage directories must not be symlinks");
      }
    }
    await safe(path);
  }
  return {
    name: "local",
    bucket: "media",
    async getAssetUrl({ bucket, key }) {
      return `${appOrigin()}/api/mcp/media/local?${new URLSearchParams({ bucket, key })}`;
    },
    async createUploadUrl({ uploadId }) {
      return `${appOrigin()}/api/mcp/uploads/local?${new URLSearchParams({ uploadId })}`;
    },
    async write(object, bytes) {
      const path = file(object.bucket, object.key);
      await ensureDirectory(dirname(path));
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        const handle = await open(
          temporary,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await handle.writeFile(bytes);
        } finally {
          await handle.close();
        }
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async read(object, maxBytes) {
      const path = await safe(file(object.bucket, object.key));
      const info = await stat(path);
      if (!info.isFile() || info.size > maxBytes) {
        throw new Error("Stored file exceeds its size limit");
      }
      const bytes = await readFile(path);
      if (bytes.length > maxBytes) {
        throw new Error("Stored file exceeds its size limit");
      }
      return bytes;
    },
    async delete(bucket, keys) {
      for (const key of keys) {
        const path = file(bucket, key);
        try {
          const dir = dirname(path);
          await safe(dir);
          await rm(path, { force: true });
          // If the file was the last one in the directory, we should remove the directory as well
          try {
            const entries = await readdir(dir);
            if (entries.length === 0) {
              await rmdir(dir).catch((error) => {
                if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) {
                  throw error;
                }
              });
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              throw error;
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }
    },
    async list(bucket, prefix, limit) {
      const prefixPath = file(
        bucket,
        prefix.endsWith("/") ? prefix.slice(0, -1) : prefix,
      );
      const keys: string[] = [];
      async function visit(path: string): Promise<void> {
        await safe(path);
        for (const entry of await readdir(path, { withFileTypes: true })) {
          if (keys.length > limit) {
            break;
          }
          const child = join(path, entry.name);
          if (entry.isDirectory()) {
            await visit(child);
          } else if (entry.isFile()) {
            keys.push(
              relative(resolve(root, bucket), child).split(sep).join("/"),
            );
          } else if (entry.isSymbolicLink()) {
            throw new Error("Local storage does not support symlinks");
          }
        }
      }
      try {
        await visit(prefixPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      return { keys: keys.slice(0, limit), truncated: keys.length > limit };
    },
  };
}
