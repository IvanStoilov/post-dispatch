import test from "node:test";
import assert from "node:assert/strict";
import { mcpDraftSchema, filesDraftSchema } from "../src/lib/mcp-images";
const draft = { title: "Test", caption: "Test", platforms: ["instagram"] };
const url = "https://example.com/image.png";
const uploadId = "00000000-0000-4000-8000-000000000001";
test("MCP assets accept all four sources without legacy conversion", () => {
  const assets = [
    { type: "EXTERNAL_URL", url },
    {
      type: "INLINE_BASE64",
      dataBase64: "YQ==",
      filename: "a.png",
      mimeType: "image/png",
    },
    { type: "UPLOAD_ID", uploadId },
    {
      type: "OPENAPI_FILE",
      download_url: url,
      file_id: "file_123",
      file_name: "a.png",
      mime_type: "image/png",
    },
  ];
  assert.deepEqual(mcpDraftSchema.parse({ ...draft, assets }), {
    ...draft,
    assets,
  });
  assert.deepEqual(mcpDraftSchema.parse(draft), draft);
});
test("MCP rejects invalid asset sources and every legacy image input", () => {
  for (const asset of [
    { url },
    { type: "OTHER", url },
    { type: "EXTERNAL_URL", download_url: url },
    { type: "EXTERNAL_URL", url, uploadId },
    { type: "EXTERNAL_URL", url: "http://example.com/a.png" },
    { type: "OPENAPI_FILE", download_url: url },
    { type: "OPENAPI_FILE", file_id: "file_123" },
    { type: "OPENAPI_FILE", download_url: url, file_id: "" },
    { type: "UPLOAD_ID", uploadId: "invalid" },
  ])
    assert.equal(
      mcpDraftSchema.safeParse({ ...draft, assets: [asset] }).success,
      false,
    );
  for (const legacy of [
    { image: { type: "EXTERNAL_URL", url } },
    { imageUrl: url },
    { imageFile: { dataBase64: "YQ==" } },
    { imageUploadId: uploadId },
  ])
    for (const current of [{}, { assets: [{ type: "EXTERNAL_URL", url }] }])
      assert.equal(
        mcpDraftSchema.safeParse({ ...draft, ...legacy, ...current }).success,
        false,
      );
});
test("ChatGPT file drafts use an assets array even for one file", () => {
  const file = { download_url: url, file_id: "file_123" };
  assert.ok(filesDraftSchema.safeParse({ ...draft, assets: [file] }).success);
  assert.ok(
    filesDraftSchema.safeParse({
      ...draft,
      assets: [{ ...file, mime_type: "image/png", file_name: "a.png" }, file],
    }).success,
  );
  for (const assets of [
    [],
    Array(11).fill(file),
    [{ download_url: url }],
    [{ ...file, type: "OPENAPI_FILE" }],
  ])
    assert.equal(
      filesDraftSchema.safeParse({ ...draft, assets }).success,
      false,
    );
  assert.equal(
    filesDraftSchema.safeParse({ ...draft, image: file }).success,
    false,
  );
});
