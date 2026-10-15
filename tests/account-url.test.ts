import test from "node:test";
import assert from "node:assert/strict";
import { connectedAccountUrl } from "../src/lib/connectors/account-url";

test("connected account links use public platform identities", () => {
  assert.equal(
    connectedAccountUrl("facebook", {
      accountId: "123",
      accountName: "Test page",
    }),
    "https://www.facebook.com/123",
  );
  assert.equal(
    connectedAccountUrl("instagram", {
      accountId: "178123",
      accountName: "@ramblo.io",
    }),
    "https://www.instagram.com/ramblo.io/",
  );
  assert.equal(
    connectedAccountUrl("linkedin", {
      accountId: "urn:li:organization:456",
      accountName: "Ramblo",
    }),
    "https://www.linkedin.com/company/456/",
  );
  assert.equal(
    connectedAccountUrl("linkedin", {
      accountId: "urn:li:person:opaque",
      accountName: "Ivan",
    }),
    null,
  );
});

test("missing usernames and invalid identities do not become account URLs", () => {
  assert.equal(
    connectedAccountUrl("instagram", {
      accountId: "178123",
      accountName: "178123",
    }),
    null,
  );
  assert.equal(
    connectedAccountUrl("instagram", {
      accountId: "178123",
      accountName: "Instagram account",
    }),
    null,
  );
  assert.equal(
    connectedAccountUrl("facebook", {
      accountId: "https://evil.example",
      accountName: "Page",
    }),
    null,
  );
});
