import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicAddress,
  downloadImage,
  uploadImage,
} from "../src/lib/storage";
import { draftSchema } from "../src/lib/store";
test("URL import rejects private, loopback, link-local, mapped and special-use addresses", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.throws(() => assertPublicAddress(ip));
  assert.doesNotThrow(() => assertPublicAddress("8.8.8.8"));
  for (const url of [
    "http://example.com/a.jpg",
    "https://user:pass@example.com/a.jpg",
    "https://example.com:8443/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://[::1]/a.jpg",
  ])
    await assert.rejects(() => downloadImage(url));
});
test("malformed image data and ambiguous inputs are rejected before storing", async () => {
  await assert.rejects(
    () => uploadImage("unused", { imageFile: { dataBase64: "not base64!" } }),
    /base64/,
  );
  await assert.rejects(
    () =>
      uploadImage("unused", {
        imageFile: {
          dataBase64: Buffer.from("not an image").toString("base64"),
        },
      }),
    /valid JPEG/,
  );
  assert.throws(
    () =>
      draftSchema.parse({
        title: "Test",
        caption: "Test",
        platforms: ["facebook"],
        imageUrl: "https://example.com/a.jpg",
        imageFile: { dataBase64: "YQ==" },
      }),
    /not both/,
  );
});
