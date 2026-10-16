import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// Serves files from a fake public host for media imports (EXTERNAL_URL,
// ChatGPT files). The real downloader still runs, including its HTTPS-only,
// public-address and redirect checks; only DNS and the HTTPS exchange for
// this host are answered here. Other hosts pass through untouched.
export const remoteHost = "media.example.test";
const publicAddress = { address: "93.184.216.34", family: 4 };

export function serveRemoteFiles() {
  const files = new Map<string, { body: Buffer; type: string }>();
  const realLookup = dns.lookup;
  const realRequest = https.request;
  // tsx compiles imports to property reads at call time, so replacing the
  // module functions reaches src/lib/storage.ts.
  (dns as { lookup: unknown }).lookup = async (
    host: string,
    options?: unknown,
  ) =>
    host === remoteHost
      ? [publicAddress]
      : (realLookup as (...args: unknown[]) => unknown)(host, options);
  (https as { request: unknown }).request = (
    url: URL | string,
    options: unknown,
    callback: (response: PassThrough) => void,
  ) => {
    const target = new URL(url);
    if (target.hostname !== remoteHost)
      return (realRequest as (...args: unknown[]) => unknown)(
        url,
        options,
        callback,
      );
    const request = Object.assign(new EventEmitter(), {
      end() {
        const file = files.get(target.pathname);
        const response = Object.assign(new PassThrough(), {
          statusCode: file ? 200 : 404,
          headers: file
            ? {
                "content-type": file.type,
                "content-length": String(file.body.length),
              }
            : {},
        });
        callback(response);
        response.end(file?.body);
      },
      destroy() {},
    });
    return request;
  };
  return {
    // Publishes bytes and returns their public HTTPS URL.
    add(path: string, body: Buffer | Uint8Array, type: string) {
      files.set(path, { body: Buffer.from(body), type });
      return `https://${remoteHost}${path}`;
    },
    restore() {
      dns.lookup = realLookup;
      https.request = realRequest;
    },
  };
}
