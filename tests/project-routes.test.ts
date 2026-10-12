import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { projectPath, applicationPath } from "../src/lib/route-paths";
import { proxy } from "../src/proxy";
const id = "11111111-1111-4111-8111-111111111111";
test("project routes are canonical, prefix aware, and reject untrusted path fragments", () => {
  assert.equal(projectPath(id), `/projects/${id}`);
  for (const section of ["published", "connections", "assistant"] as const) {
    assert.equal(
      applicationPath(projectPath(id, section)),
      `/app/projects/${id}/${section}`,
    );
    assert.equal(
      applicationPath(projectPath(id, section), true),
      `/projects/${id}/${section}`,
    );
  }
  assert.throws(() => projectPath("../another-account"));
  assert.throws(() => projectPath("https://evil.test"));
});
test("project pages rewrite on app host, retain filters, and require a session", () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    APP_URL: "https://preview.vercel.app",
    VERCEL_URL: "preview.vercel.app",
    VERCEL_ENV: "preview",
    APPLICATION_URL: "https://app.ramblo.io",
    PUBLIC_URL: "https://www.ramblo.io",
  });
  try {
    const path =
      projectPath(id, "published") + "?channel=facebook&search=hello";
    const rewrite = proxy(
      new NextRequest(`https://app.ramblo.io${path}`, {
        headers: {
          host: "app.ramblo.io",
          cookie: "better-auth.session_token=test",
        },
      }),
    );
    const destination = new URL(rewrite.headers.get("x-middleware-rewrite")!);
    assert.equal(destination.pathname, `/app/projects/${id}/published`);
    assert.equal(destination.search, "?channel=facebook&search=hello");
    const anonymous = proxy(
      new NextRequest(
        `https://preview.vercel.app/app/projects/${id}/assistant`,
        { headers: { host: "preview.vercel.app" } },
      ),
    );
    assert.equal(anonymous.status, 307);
    assert.equal(
      new URL(anonymous.headers.get("location")!).pathname,
      "/app/signin",
    );
  } finally {
    process.env = env;
  }
});
