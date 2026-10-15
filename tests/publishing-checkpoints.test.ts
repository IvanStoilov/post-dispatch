import test from "node:test";
import assert from "node:assert/strict";
import { publishMeta } from "../src/lib/connectors/meta";
import { uploadLinkedInAsset } from "../src/lib/connectors/linkedin";
import {
  MediaPending,
  type PublishProgress,
  type PublishContext,
} from "../src/lib/connectors/types";

function progress(): PublishProgress {
  const value: PublishProgress = {
    state: {},
    checkpoint: async (state) => {
      value.state = structuredClone(state);
    },
    beforeSubmit: async () => {},
  };
  return value;
}
function context(
  provider: "instagram" | "facebook",
  p: PublishProgress,
): PublishContext {
  return {
    connection: {
      id: "connector",
      projectId: "project",
      provider,
      accountId: "account",
      accessToken: "token",
      accountName: "Test",
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      metadata: {},
      updatedAt: new Date(),
    },
    post: {
      id: "post",
      projectId: "project",
      title: "Title",
      caption: "Caption",
      platforms: [provider],
      source: "Manual",
      status: "publishing",
      createdAt: new Date().toISOString(),
      assets: [],
      imageUrl: "",
      results: {},
    },
    assets: [
      {
        id: "asset",
        kind: "VIDEO",
        storageProvider: "s3",
        imageBucket: "bucket",
        imageKey: "video.mp4",
        mimeType: "video/mp4",
      },
    ],
    urls: ["https://example.test/video.mp4"],
    signal: AbortSignal.timeout(10000),
    progress: p,
  };
}

test("Instagram processing yields and resumes the saved container without another upload", async () => {
  const original = globalThis.fetch;
  const p = progress();
  let creates = 0,
    polls = 0,
    publishes = 0,
    submitted = false;
  p.beforeSubmit = async () => {
    assert.equal(p.state.containerId, "saved-container");
    submitted = true;
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/media")) {
      creates++;
      return Response.json({ id: "saved-container" });
    }
    if (url.includes("?fields=status_code,status")) {
      polls++;
      return Response.json({
        status_code: polls === 1 ? "IN_PROGRESS" : "FINISHED",
      });
    }
    assert.ok(url.endsWith("/media_publish"));
    assert.ok(submitted);
    assert.equal(
      new URLSearchParams(init!.body as URLSearchParams).get("creation_id"),
      "saved-container",
    );
    publishes++;
    return Response.json({ id: "published-post" });
  };
  try {
    await assert.rejects(publishMeta(context("instagram", p)), MediaPending);
    assert.equal(p.state.containerId, "saved-container");
    assert.equal(publishes, 0);
    assert.equal(await publishMeta(context("instagram", p)), "published-post");
    assert.equal(creates, 1);
    assert.equal(polls, 2);
    assert.equal(publishes, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("Facebook albums reuse saved unpublished photos before the final submission", async () => {
  const original = globalThis.fetch;
  const p = progress();
  p.state = { mediaIds: ["previous-photo"] };
  const c = context("facebook", p);
  c.assets = c.assets.map((a) => ({
    ...a,
    kind: "IMAGE",
    mimeType: "image/jpeg",
  }));
  c.urls = [
    "https://example.test/first.jpg",
    "https://example.test/second.jpg",
  ];
  let uploads = 0,
    submitted = false;
  p.beforeSubmit = async () => {
    assert.deepEqual(p.state.mediaIds, ["previous-photo", "next-photo"]);
    submitted = true;
  };
  globalThis.fetch = async (input, init) => {
    const fields = new URLSearchParams(init!.body as URLSearchParams);
    if (String(input).endsWith("/photos")) {
      uploads++;
      assert.equal(fields.get("url"), c.urls[1]);
      assert.equal(fields.get("published"), "false");
      return Response.json({ id: "next-photo" });
    }
    assert.ok(submitted);
    assert.equal(
      fields.get("attached_media[0]"),
      JSON.stringify({ media_fbid: "previous-photo" }),
    );
    return Response.json({ id: "album-post" });
  };
  try {
    assert.equal(await publishMeta(c), "album-post");
    assert.equal(uploads, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("LinkedIn video processing resumes its saved video without initialization or uploading again", async () => {
  const original = globalThis.fetch;
  const p = progress();
  p.state = { videoId: "urn:li:video:saved" };
  let checks = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method, "GET");
    assert.ok(String(input).includes("/rest/videos/urn%3Ali%3Avideo%3Asaved"));
    checks++;
    return Response.json({ status: checks === 1 ? "PROCESSING" : "AVAILABLE" });
  };
  try {
    const call = () =>
      uploadLinkedInAsset(
        "urn:li:person:test",
        "token",
        new Uint8Array(),
        "VIDEO",
        AbortSignal.timeout(10000),
        p,
      );
    await assert.rejects(call(), MediaPending);
    assert.equal(await call(), "urn:li:video:saved");
    assert.equal(checks, 2);
  } finally {
    globalThis.fetch = original;
  }
});
