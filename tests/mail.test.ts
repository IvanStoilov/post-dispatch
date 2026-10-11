import test from "node:test";
import assert from "node:assert/strict";
import { mailProvider, sendMail } from "../src/lib/mail";
import { parseAddress } from "../src/lib/mail/types";
import {
  passwordResetEmail,
  verificationEmail,
} from "../src/lib/mail/templates";

const realFetch = globalThis.fetch;
const env = { ...process.env };
function restore() {
  globalThis.fetch = realFetch;
  process.env = { ...env };
}
function captureFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return response.clone();
  };
  return calls;
}
const pending = verificationEmail({
  to: "ana@example.test",
  name: "Ana <b>Ruiz</b>",
  url: "https://app.example/api/auth/verify-email?token=abc&callbackURL=%2F",
});

test("templates escape user input and keep the link in both parts", async () => {
  const message = await pending;
  assert.ok(!message.html.includes("<b>"));
  assert.ok(message.html.includes("Hi Ana"));
  assert.ok(
    message.html.includes(
      'href="https://app.example/api/auth/verify-email?token=abc&amp;callbackURL=%2F"',
    ),
  );
  assert.ok(message.text.includes("token=abc&callbackURL=%2F"));
  assert.ok(message.text.includes("CONFIRM YOUR EMAIL"));
  assert.ok(!message.text.includes("<"));
  const reset = await passwordResetEmail({
    to: "a@b.c",
    name: "",
    url: "https://x.example/reset",
  });
  assert.match(reset.subject, /Reset/);
  assert.ok(reset.text.includes("Hi, we received"));
  assert.ok(reset.text.includes("https://x.example/reset"));
});

test("parseAddress handles named and bare addresses", () => {
  assert.deepEqual(parseAddress('"Post Dispatch" <hi@example.com>'), {
    name: "Post Dispatch",
    email: "hi@example.com",
  });
  assert.deepEqual(parseAddress("hi@example.com"), { email: "hi@example.com" });
});

test("provider selection", async (t) => {
  t.after(restore);
  process.env.MAIL_PROVIDER = "mailchimp";
  assert.throws(() => mailProvider(), /MAIL_PROVIDER must be/);
  process.env.MAIL_PROVIDER = "resend";
  delete process.env.RESEND_API_KEY;
  assert.throws(() => mailProvider(), /RESEND_API_KEY is required/);
  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.MAIL_PROVIDER = "console";
  assert.throws(() => mailProvider(), /cannot be used in production/);
  delete process.env.MAIL_PROVIDER;
  assert.throws(() => mailProvider(), /Set MAIL_PROVIDER/);
});

test("Resend request shape", async (t) => {
  const message = await pending;
  t.after(restore);
  process.env.MAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "PostDispatch <hi@example.com>";
  process.env.MAIL_REPLY_TO = "support@example.com";
  const calls = captureFetch(Response.json({ id: "msg_1" }));
  await sendMail(message, "email_verification");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer re_test",
  );
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, ["ana@example.test"]);
  assert.equal(body.from, "PostDispatch <hi@example.com>");
  assert.equal(body.reply_to, "support@example.com");
  assert.equal(body.text, message.text);
  captureFetch(
    Response.json({ message: "Domain not verified" }, { status: 403 }),
  );
  await assert.rejects(
    () => sendMail(message, "email_verification"),
    /Resend rejected the email: Domain not verified/,
  );
});

test("SendGrid request shape", async (t) => {
  const message = await pending;
  t.after(restore);
  process.env.MAIL_PROVIDER = "sendgrid";
  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.MAIL_FROM = "PostDispatch <hi@example.com>";
  delete process.env.MAIL_REPLY_TO;
  const calls = captureFetch(
    new Response(null, { status: 202, headers: { "X-Message-Id": "sg_1" } }),
  );
  await sendMail(message, "email_verification");
  assert.equal(calls[0].url, "https://api.sendgrid.com/v3/mail/send");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.from, {
    name: "PostDispatch",
    email: "hi@example.com",
  });
  assert.deepEqual(body.personalizations, [
    { to: [{ email: "ana@example.test" }] },
  ]);
  assert.deepEqual(
    body.content.map((c: { type: string }) => c.type),
    ["text/plain", "text/html"],
  );
  assert.equal(body.tracking_settings.click_tracking.enable, false);
  assert.equal(body.reply_to, undefined);
  captureFetch(
    Response.json(
      {
        errors: [
          {
            message:
              "The from address does not match a verified Sender Identity",
          },
        ],
      },
      { status: 403 },
    ),
  );
  await assert.rejects(
    () => sendMail(message, "email_verification"),
    /SendGrid rejected the email: The from address/,
  );
});
