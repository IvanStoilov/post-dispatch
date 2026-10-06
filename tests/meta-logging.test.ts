import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import winston from "winston";
import { logger, redact, withLogContext } from "../src/lib/logger";
import { metaRequest } from "../src/lib/meta-client";

test("Meta logs correlate POST/GET responses and redact credentials", async () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const originalFetch = globalThis.fetch;
  const originalLevel = logger.level;
  const originalTransports = [...logger.transports];
  logger.clear();
  logger.level = "debug";
  logger.add(new winston.transports.Stream({ stream }));
  const token = "secret-meta-token";
  try {
    const requests: RequestInit[] = [];
    globalThis.fetch = async (_url, init) => {
      requests.push(init!);
      return Response.json(
        {
          error: {
            message: `Rejected ${token}`,
            code: 190,
            error_subcode: 463,
            fbtrace_id: "trace-1",
          },
        },
        { status: 400, headers: { "x-fb-request-id": "request-1" } },
      );
    };
    await Promise.all(
      ["post-a", "post-b"].map((postId) =>
        withLogContext({ projectId: "project", postId }, () =>
          metaRequest(
            "https://graph.facebook.com/v25.0/page/photos",
            token,
            new AbortController().signal,
            {
              url: "https://user:password@storage.example/image.jpg?X-Amz-Signature=private-signature",
              caption: "Hello",
            },
          ),
        ),
      ),
    );
    await withLogContext({ projectId: "project", postId: "post-a" }, () =>
      metaRequest(
        "https://graph.instagram.com/v25.0/container?fields=status_code,status",
        token,
        new AbortController().signal,
      ),
    );
    const logs = lines.map((line) => JSON.parse(line));
    assert.equal(logs.length, 6);
    for (const request of logs.filter(
      (entry) => entry.message === "meta.request",
    )) {
      const response = logs.find(
        (entry) =>
          entry.message === "meta.response" &&
          entry.requestId === request.requestId,
      );
      assert.equal(response.postId, request.postId);
      assert.equal(response.projectId, "project");
      assert.equal(response.status, 400);
      assert.equal(response.body.error.error_subcode, 463);
      assert.equal(response.headers["x-fb-request-id"], "request-1");
      assert.equal(typeof response.durationMs, "number");
    }
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[2].method, "GET");
    assert.equal(logs[4].fields.fields, "status_code,status");
    const serialized = lines.join("");
    for (const secret of [token, "password", "private-signature", "Bearer"])
      assert.ok(!serialized.includes(secret));
    assert.ok(serialized.includes("https://storage.example/image.jpg"));

    lines.length = 0;
    globalThis.fetch = async () =>
      new Response(
        `not JSON ${token} https://storage.example/file?secret=hidden`,
        { status: 502 },
      );
    await assert.rejects(
      metaRequest(
        "https://graph.facebook.com/test",
        token,
        new AbortController().signal,
      ),
    );
    assert.deepEqual(
      lines.map((line) => JSON.parse(line).message),
      ["meta.request", "meta.response", "meta.failure"],
    );
    assert.equal(JSON.parse(lines[2]).phase, "parse-response");
    assert.ok(!lines.join("").includes(token));
    assert.ok(!lines.join("").includes("hidden"));

    lines.length = 0;
    globalThis.fetch = async () => {
      throw new Error(`Network failure ${token}`);
    };
    await assert.rejects(
      metaRequest(
        "https://graph.facebook.com/test",
        token,
        new AbortController().signal,
      ),
    );
    assert.equal(JSON.parse(lines[1]).phase, "fetch");
    assert.ok(!lines.join("").includes(token));
  } finally {
    globalThis.fetch = originalFetch;
    logger.clear();
    for (const transport of originalTransports) logger.add(transport);
    logger.level = originalLevel;
  }
});

test("redaction handles nested credentials and truncates after removing secrets", () => {
  const result = redact(
    {
      access_token: "secret",
      nested: [
        {
          authorization: "secret",
          message: "x".repeat(8200) + "secret",
          url: "https://storage.example/a?secret=hidden",
        },
      ],
    },
    ["secret"],
  );
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('"secret"'));
  assert.ok(!serialized.includes("hidden"));
  assert.ok(serialized.includes("[truncated]"));
});
