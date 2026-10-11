import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createQueue, queueDriver } from "../src/lib/queue";

function localEnvironment() {
  const original = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.VERCEL;
  delete process.env.QUEUE_DRIVER;
  return () => {
    process.env = original;
  };
}

test("local queue runs the handler without network and awaits completion", async () => {
  const restore = localEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Local queue must not contact a provider");
  };
  try {
    let finished = false;
    const queue = createQueue<{ id: string }>("test", async (message) => {
      await Promise.resolve();
      assert.equal(message.id, "job-1");
      finished = true;
    });
    const result = await queue.send({ id: "job-1" });
    assert.ok(finished);
    assert.equal(typeof result.messageId, "string");
    assert.match(result.messageId!, /^local-/);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("local queue propagates failures and doesn't silently retry publishing", async () => {
  const restore = localEnvironment();
  try {
    let attempts = 0;
    const queue = createQueue("test", async () => {
      attempts++;
      throw new Error("Uncertain submission");
    });
    await assert.rejects(
      queue.send({}, { delaySeconds: 60 }),
      /scheduled in Postgres/,
    );
    await assert.rejects(queue.send({}), /Uncertain submission/);
    assert.equal(attempts, 1);
  } finally {
    restore();
  }
});

test("local payloads cross a JSON boundary and HTTP callbacks cannot run work", async () => {
  const restore = localEnvironment();
  try {
    let calls = 0;
    const payload = { id: "job-1" };
    const queue = createQueue<typeof payload>("test", async (message) => {
      calls++;
      message.id = "changed";
    });
    await queue.send(payload);
    assert.equal(payload.id, "job-1");
    const response = await queue.handleCallback()(
      new Request("http://localhost"),
    );
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await assert.rejects(createQueue("test", async () => {}).send(cyclic));
  } finally {
    restore();
  }
});

test("production selects Vercel and refuses accidental local delivery", () => {
  const restore = localEnvironment();
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal(queueDriver(), "vercel");
    process.env.QUEUE_DRIVER = "local";
    assert.throws(queueDriver, /only available in development/);
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.VERCEL = "1";
    assert.throws(queueDriver, /only available in development/);
    process.env.QUEUE_DRIVER = "other";
    assert.throws(queueDriver, /must be local or vercel/);
  } finally {
    restore();
  }
});

test("callbacks outside Vercel cannot invoke any handler or queue API", async () => {
  const restore = localEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unauthenticated callbacks must not contact a provider");
  };
  try {
    process.env.QUEUE_DRIVER = "vercel";
    const queue = createQueue("test", async () => {
      throw new Error("Unauthenticated callbacks must not run work");
    });
    delete process.env.CRON_SECRET;
    const callback = queue.handleCallback();
    assert.equal((await callback(new Request("http://localhost"))).status, 401);
    process.env.CRON_SECRET = "private-callback-secret";
    assert.equal(
      (
        await callback(
          new Request("http://localhost", {
            headers: {
              "x-postdispatch-queue-secret": "private-callback-secret",
            },
          }),
        )
      ).status,
      401,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("private Vercel deliveries run without the old custom callback header", async () => {
  const original = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: "production",
    VERCEL: "1",
    QUEUE_DRIVER: "vercel",
    VERCEL_REGION: "iad1",
    VERCEL_DEPLOYMENT_ID: "dpl_queue_test",
    VERCEL_OIDC_TOKEN: [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url"),
      "test-signature",
    ].join("."),
  });
  delete process.env.CRON_SECRET;
  const calls: { url: string; method: string | undefined; headers: Headers }[] =
    [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
    });
    return Response.json({ messageId: "message-test" });
  };
  try {
    let delivered = 0;
    const queue = createQueue<{ jobId: string }>(
      "publishing",
      async (payload) => {
        assert.deepEqual(payload, { jobId: "job-test" });
        delivered++;
      },
    );
    const sent = await queue.send({ jobId: "job-test" }, { delaySeconds: 3 });
    assert.equal(sent.messageId, "message-test");
    assert.equal(calls[0].headers.has("x-postdispatch-queue-secret"), false);
    assert.equal(calls[0].headers.get("Vqs-Delay-Seconds"), "3");
    const request = new Request(
      "https://deployment.vercel.app/api/queues/publishing",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "ce-type": "com.vercel.queue.v2beta",
          "ce-vqsqueuename": "publishing",
          "ce-vqsconsumergroup": "publishing-worker",
          "ce-vqsmessageid": "message-test",
          "ce-vqsreceipthandle": "receipt-test",
          "ce-vqsregion": "iad1",
        },
        body: JSON.stringify({ jobId: "job-test" }),
      },
    );
    const response = await queue.handleCallback()(request);
    assert.equal(response.status, 200);
    assert.equal(delivered, 1);
    assert.ok(
      calls.some(
        (call) =>
          call.method === "DELETE" && call.url.endsWith("/lease/receipt-test"),
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = original;
  }
});

test("publishing consumer retains Vercel's private queue trigger", async () => {
  const deployment = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  const triggers =
    deployment.functions["src/app/api/queues/publishing/route.ts"]
      .experimentalTriggers;
  assert.ok(
    triggers.some(
      (trigger: { type: string; topic: string }) =>
        trigger.type === "queue/v2beta" && trigger.topic === "publishing",
    ),
  );
});
