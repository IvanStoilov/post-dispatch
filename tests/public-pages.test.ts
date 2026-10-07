import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
const origin = new URL(process.env.APP_URL || "http://localhost:8200");
const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, origin), {
    headers: { host: origin.host, ...headers },
  });
test("public content is accessible without opening authenticated APIs", () => {
  for (const path of [
    "/",
    "/guide",
    "/privacy",
    "/terms",
    "/support",
    "/legal",
    "/data-deletion",
    "/robots.txt",
    "/sitemap.xml",
  ])
    assert.equal(
      proxy(request(path)).headers.get("x-middleware-next"),
      "1",
      path,
    );
  for (const path of [
    "/api/projects",
    "/api/posts",
    "/api/connections",
    "/api/assets/uploads",
  ])
    assert.equal(proxy(request(path)).status, 401, path);
});
test("public paths cannot be used as prefixes to bypass route protection", () => {
  for (const path of [
    "/privacy/private",
    "/guide/private",
    "/support/private",
    "/connections/facebook",
  ]) {
    const response = proxy(request(path));
    assert.equal(response.status, 307, path);
    assert.equal(
      new URL(response.headers.get("location")!).pathname,
      "/signin",
    );
  }
});
test("public pages retain host and cross-origin mutation protection", () => {
  assert.equal(
    proxy(request("/privacy", { host: "attacker.example" })).status,
    403,
  );
  assert.equal(
    proxy(request("/api/posts", { origin: "https://attacker.example" })).status,
    403,
  );
});
