import test from "node:test";
import assert from "node:assert/strict";
import {
  mcpDraftSchema,
  fileDraftSchema,
  draftStorageInput,
} from "../src/lib/mcp-images";
const draft = { title: "Test", caption: "Test", platforms: ["instagram"] };
const url = "https://example.com/image.png";
const uploadId = "00000000-0000-4000-8000-000000000001";
test("typed MCP images normalize all four sources to private storage inputs", () => {
  const inputs = [
    [{ type: "EXTERNAL_URL", url }, { imageUrl: url }],
    [
      {
        type: "INLINE_BASE64",
        dataBase64: "YQ==",
        filename: "a.png",
        mimeType: "image/png",
      },
      {
        imageFile: {
          dataBase64: "YQ==",
          filename: "a.png",
          mimeType: "image/png",
        },
      },
    ],
    [{ type: "UPLOAD_ID", uploadId }, { imageUploadId: uploadId }],
    [
      {
        type: "OPENAPI_FILE",
        download_url: url,
        file_id: "file_123",
        file_name: "a.png",
        mime_type: "image/png",
      },
      { imageUrl: url },
    ],
  ];
  for (const [image, storage] of inputs) {
    const parsed = mcpDraftSchema.parse({ ...draft, image });
    assert.deepEqual(draftStorageInput(parsed), { ...draft, ...storage });
  }
  assert.deepEqual(draftStorageInput(mcpDraftSchema.parse(draft)), draft);
});
test("MCP image discriminator rejects missing, mixed, insecure and legacy inputs", () => {
  for (const image of [
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
    assert.equal(mcpDraftSchema.safeParse({ ...draft, image }).success, false);
  for (const legacy of [
    { imageUrl: url },
    { imageFile: { dataBase64: "YQ==" } },
    { imageUploadId: uploadId },
  ])
    assert.equal(
      mcpDraftSchema.safeParse({ ...draft, ...legacy }).success,
      false,
    );
});
test("ChatGPT file draft accepts the host file contract with optional metadata", () => {
  const image = { download_url: url, file_id: "file_123" };
  assert.ok(fileDraftSchema.safeParse({ ...draft, image }).success);
  assert.ok(
    fileDraftSchema.safeParse({
      ...draft,
      image: { ...image, mime_type: "image/png", file_name: "a.png" },
    }).success,
  );
  assert.equal(
    fileDraftSchema.safeParse({ ...draft, image: { download_url: url } })
      .success,
    false,
  );
  assert.equal(
    fileDraftSchema.safeParse({
      ...draft,
      image: { ...image, type: "OPENAPI_FILE" },
    }).success,
    false,
  );
});
