import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { config } from "../src/lib/config";
import {
  appOrigin,
  publicOrigin,
  appPagePath,
  appPageUrl,
} from "../src/lib/origins";
import { applicationPath } from "../src/lib/route-paths";
import { publicPages } from "../src/lib/public-routes";

const request = (
  path: string,
  origin: string,
  headers: Record<string, string> = {},
  method = "GET",
) =>
  new NextRequest(new URL(path, origin), {
    method,
    headers: { host: new URL(origin).host, ...headers },
  });
const publicHost = "https://www.ramblo.io";
const appHost = "https://app.ramblo.io";

test("public pages remain public on local, preview and www hosts, even with a session", () => {
  for (const host of [config.APP_URL, publicHost])
    for (const path of [...publicPages, "/robots.txt", "/sitemap.xml"])
      for (const cookie of ["", "better-auth.session_token=example"]) {
        const response = proxy(request(path, host, { cookie }));
        assert.equal(response.headers.get("x-middleware-next"), "1", path);
        assert.equal(response.headers.get("x-middleware-rewrite"), null, path);
      }
});

test("local and preview application paths require sessions and auth pages stay accessible", () => {
  for (const path of [
    "/app",
    "/app/connections/facebook",
    "/app/oauth/consent",
  ])
    assert.equal(
      proxy(request(path, config.APP_URL)).headers.get("location"),
      `${config.APP_URL}/app/signin`,
    );
  for (const path of [
    "/app/signin",
    "/app/signup",
    "/app/forgot-password",
    "/app/reset-password?token=example",
  ])
    assert.equal(
      proxy(request(path, config.APP_URL)).headers.get("x-middleware-next"),
      "1",
      path,
    );
  const workspace = proxy(
    request("/app?projectId=example", config.APP_URL, {
      cookie: "better-auth.session_token=example",
    }),
  );
  assert.equal(workspace.headers.get("x-middleware-next"), "1");
  assert.equal(workspace.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("app domain rewrites clean URLs to /app routes and strips redundant prefixes", () => {
  assert.equal(
    proxy(request("/", appHost)).headers.get("location"),
    `${appHost}/signin`,
  );
  for (const path of ["/", "/signin", "/connections/facebook"]) {
    const response = proxy(
      request(path + "?projectId=example", appHost, {
        cookie: "better-auth.session_token=example",
      }),
    );
    const rewritten = new URL(response.headers.get("x-middleware-rewrite")!);
    assert.equal(rewritten.pathname, path === "/" ? "/app" : `/app${path}`);
    assert.equal(rewritten.search, "?projectId=example");
  }
  assert.equal(
    proxy(request("/app/signin?verified=1", appHost)).headers.get("location"),
    `${appHost}/signin?verified=1`,
  );
  assert.equal(
    proxy(request("/app", appHost)).headers.get("location"),
    `${appHost}/`,
  );
});

test("public-domain app routes and app-domain public routes redirect correctly", () => {
  assert.equal(
    proxy(request("/app/signin?oauth_query=example", publicHost)).headers.get(
      "location",
    ),
    `${appHost}/signin?oauth_query=example`,
  );
  assert.equal(
    proxy(
      request("/.well-known/oauth-protected-resource/api/mcp", publicHost),
    ).headers.get("location"),
    `${appHost}/.well-known/oauth-protected-resource/api/mcp`,
  );
  const original = { ...process.env };
  try {
    process.env.VERCEL_ENV = "production";
    for (const path of publicPages.filter((p) => p !== "/"))
      assert.equal(
        proxy(request(path + "?from=app", appHost)).headers.get("location"),
        `${publicOrigin()}${path}?from=app`,
      );
  } finally {
    process.env = original;
  }
});

test("APIs remain unprefixed and domain routing preserves host/origin checks", () => {
  for (const path of [
    "/api/v1/projects",
    "/api/posts/post/image",
    "/api/auth/sign-in/email",
    "/api/mcp",
    "/api/queues/publishing",
    "/api/cron/publishing",
  ])
    assert.equal(proxy(request(path, publicHost)).status, 404, path);
  for (const host of [appHost, config.APP_URL]) {
    for (const path of [
      "/api/v1/projects",
      "/api/posts/post/image",
      "/api/connections",
      "/api/v1/projects/project/uploads",
    ])
      assert.equal(proxy(request(path, host)).status, 401, path);
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/mcp",
      "/.well-known/oauth-protected-resource/api/mcp",
    ])
      assert.equal(
        proxy(request(path, host)).headers.get("x-middleware-next"),
        "1",
        path,
      );
    assert.equal(
      proxy(
        request(
          "/api/v1/projects",
          host,
          { origin: "https://attacker.example" },
          "POST",
        ),
      ).status,
      403,
    );
  }
  assert.equal(
    proxy(request("/privacy", config.APP_URL, { host: "attacker.example" }))
      .status,
    403,
  );
  assert.equal(
    proxy(request("/api/v1/projects", appHost, { origin: publicHost }, "POST"))
      .status,
    403,
  );
  assert.equal(
    proxy(request("/app/signup", publicHost, {}, "POST")).status,
    404,
  );
});

test("server page helpers keep previews/local self-contained and production URLs clean", () => {
  const saved = { ...process.env };
  try {
    delete process.env.APPLICATION_URL;
    delete process.env.PUBLIC_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    process.env.APP_URL = "http://localhost:8200";
    assert.equal(appPageUrl("/signin"), "http://localhost:8200/app/signin");
    assert.equal(
      appPageUrl("/?projectId=example"),
      "http://localhost:8200/app?projectId=example",
    );
    assert.equal(publicOrigin(), "http://localhost:8200");
    process.env.VERCEL_URL = "ramblo-preview.vercel.app";
    process.env.VERCEL_ENV = "preview";
    assert.equal(appOrigin(), "https://ramblo-preview.vercel.app");
    assert.equal(publicOrigin(), appOrigin());
    assert.equal(appPagePath("/oauth/consent"), "/app/oauth/consent");
    assert.equal(
      appPageUrl("/reset-password?token=example"),
      "https://ramblo-preview.vercel.app/app/reset-password?token=example",
    );
    process.env.VERCEL_ENV = "production";
    assert.equal(appOrigin(), appHost);
    assert.equal(publicOrigin(), publicHost);
    assert.equal(appPageUrl("/signup"), `${appHost}/signup`);
    assert.equal(
      proxy(request("/app/signin?verified=1", config.APP_URL)).headers.get(
        "location",
      ),
      `${appHost}/signin?verified=1`,
    );
    assert.equal(
      proxy(
        request("/api/queues/publishing", config.APP_URL, {}, "POST"),
      ).headers.get("x-middleware-next"),
      "1",
    );
  } finally {
    process.env = saved;
  }
  assert.throws(() => applicationPath("//attacker.example"), /relative/);
});
