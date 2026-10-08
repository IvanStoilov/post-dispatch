import assert from "node:assert/strict";
import { test } from "node:test";
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

test("hosted callbacks authenticate before invoking any handler or queue API", async () => {
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
            headers: { "x-postdispatch-queue-secret": "wrong" },
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
