import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as mediaRoute from "../../src/app/api/mcp/media/local/route";
import * as uploadRoute from "../../src/app/api/mcp/uploads/local/route";

// Local storage set up by tests/setup.mjs. Files live under
// <LOCAL_STORAGE_PATH>/<bucket>/<key>.
const configuredRoot = process.env.RAMBLO_TEST_STORAGE_ROOT;
if (!configuredRoot || process.env.STORAGE_PROVIDER !== "local")
  throw new Error(
    "Run tests through `pnpm test`, which preloads tests/setup.mjs",
  );
const root: string = configuredRoot;
const data = join(root, "data");

export function storedFile(bucket: string, key: string) {
  return join(data, bucket, ...key.split("/"));
}
export function isStored(bucket: string, key: string) {
  return existsSync(storedFile(bucket, key));
}
// Puts a file in local storage directly, for fixtures that insert media rows.
export function storeFile(bucket: string, key: string, body = "fixture") {
  const path = storedFile(bucket, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

// Simulates a storage outage with real filesystem errors: pointing storage
// at a file makes every read, list and delete fail until restored.
export function breakStorage() {
  const unavailable = join(root, "unavailable");
  writeFileSync(unavailable, "");
  process.env.LOCAL_STORAGE_PATH = unavailable;
  return () => {
    process.env.LOCAL_STORAGE_PATH = data;
  };
}

// Local upload and media URLs point at the app's own routes; deliver those
// requests in-process instead of over the network.
export function storageRequest(url: string, init?: RequestInit) {
  const request = new Request(url, init);
  const { pathname } = new URL(url);
  if (pathname === "/api/mcp/uploads/local" && request.method === "PUT")
    return uploadRoute.PUT(request);
  if (pathname === "/api/mcp/media/local" && request.method === "GET")
    return mediaRoute.GET(request);
  throw new Error(`No local storage route for ${request.method} ${pathname}`);
}
