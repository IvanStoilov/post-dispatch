import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import winston from "winston";
import {
  logger,
  logContext,
  loggedOperation,
  loggedRequest,
  withLogContext,
  withLogSecrets,
} from "../src/lib/logger";

async function capture(
  action: (entries: Record<string, unknown>[]) => Promise<void>,
) {
  const entries: Record<string, unknown>[] = [];
  const transports = [...logger.transports];
  const level = logger.level;
  const stream = new Writable({
    write(chunk, _encoding, done) {
      entries.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  logger.clear();
  logger.level = "debug";
  logger.add(new winston.transports.Stream({ stream }));
  try {
    await action(entries);
  } finally {
    logger.clear();
    for (const transport of transports) logger.add(transport);
    logger.level = level;
  }
}

test("concurrent requests keep nested user/project context isolated and preserve responses", async () => {
  await capture(async (entries) => {
    const results = await Promise.all(
      ["a", "b"].map((id) =>
        loggedRequest(
          new Request(`https://app.example/api/posts?token=private-${id}`),
          "/api/posts",
          () =>
            withLogContext({ userId: id }, () =>
              loggedOperation(
                "posts.create",
                { projectId: `project-${id}` },
                async () => {
                  await new Promise<void>((resolve) => setImmediate(resolve));
                  logger.debug("post.saved");
                  return new Response(id, {
                    status: id === "a" ? 201 : 400,
                    headers: { "set-cookie": "session=private; HttpOnly" },
                  });
                },
              ),
            ),
        ),
      ),
    );
    assert.deepEqual(await Promise.all(results.map((r) => r.text())), [
      "a",
      "b",
    ]);
    assert.equal(
      results[0].headers.get("set-cookie"),
      "session=private; HttpOnly",
    );
    const requests = entries.filter(
      (entry) => entry.message === "http.request",
    );
    assert.notEqual(requests[0].requestId, requests[1].requestId);
    for (const saved of entries.filter(
      (entry) => entry.message === "post.saved",
    )) {
      assert.equal(saved.projectId, `project-${saved.userId}`);
      const response = entries.find(
        (entry) =>
          entry.message === "http.response" &&
          entry.requestId === saved.requestId,
      )!;
      assert.equal(response.status, saved.userId === "a" ? 201 : 400);
      assert.equal(response.level, saved.userId === "a" ? "debug" : "warn");
      assert.equal(typeof response.durationMs, "number");
    }
    assert.deepEqual(logContext(), {});
    assert.ok(!JSON.stringify(entries).includes("private"));
  });
});

test("all Winston writes redact scoped credentials, content and signed URLs", async () => {
  await capture(async (entries) => {
    await withLogSecrets(["customer-db-token"], () =>
      withLogContext({ jobId: "job" }, async () => {
        logger.error("test.failure", {
          error: new Error(
            "customer-db-token Bearer another-private-token failed",
          ),
          nested: {
            password: "raw-password",
            completionToken: "raw-upload-token",
            cookie: "session-cookie",
            caption: "private post",
            dataBase64: "private-bytes",
          },
          code: "oauth-code",
          providerError: { code: 190, error_subcode: 463 },
          url: "https://username:pass@storage.example/file?X-Amz-Signature=private-signature",
        });
        assert.ok(!("redactionSecrets" in logContext()));
      }),
    );
    const serialized = JSON.stringify(entries);
    for (const secret of [
      "customer-db-token",
      "another-private-token",
      "raw-password",
      "raw-upload-token",
      "session-cookie",
      "private post",
      "private-bytes",
      "oauth-code",
      "private-signature",
      "username",
      "redactionSecrets",
    ])
      assert.ok(!serialized.includes(secret), secret);
    assert.equal(entries[0].jobId, "job");
    assert.deepEqual(entries[0].providerError, {
      code: 190,
      error_subcode: 463,
    });
    assert.equal(entries[0].url, "https://storage.example/file");
  });
});

test("exceptions retain identity and tool error results are logged as rejected", async () => {
  await capture(async (entries) => {
    const failure = new Error("Storage unavailable");
    await assert.rejects(
      loggedRequest(
        new Request("https://app.example/api/posts"),
        "/api/posts",
        () =>
          loggedOperation("storage.read", {}, async () => {
            throw failure;
          }),
      ),
      (error) => error === failure,
    );
    assert.deepEqual(
      entries.map((entry) => entry.message),
      ["http.request", "operation.started", "operation.failed", "http.failure"],
    );
    assert.equal(
      (entries[2].error as { message: string }).message,
      failure.message,
    );
    const result = { isError: true, content: [{ text: "Private detail" }] };
    assert.equal(
      await loggedOperation(
        "mcp.tool",
        { tool: "create_draft" },
        async () => result,
      ),
      result,
    );
    assert.equal(entries.at(-1)?.outcome, "rejected");
    assert.equal(entries.at(-1)?.level, "warn");
    assert.ok(!JSON.stringify(entries).includes("Private detail"));
  });
});
