import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { currentTerms } from "../src/lib/terms";
import { TermsDocument } from "../src/components/terms-document";

test("canonical terms resolve the Markdown template and hash the exact accepted source", () => {
  const terms = currentTerms();
  assert.match(terms.content, /^# Ramblo Terms of Service/);
  assert.equal((terms.content.match(/^## \d+\./gm) || []).length, 12);
  assert.ok(!terms.content.includes("{{"));
  assert.equal(
    terms.hash,
    createHash("sha256").update(terms.content, "utf8").digest("hex"),
  );
});
test("terms render Markdown formatting without enabling raw HTML", () => {
  const html = renderToStaticMarkup(
    createElement(TermsDocument, { content: currentTerms().content }),
  );
  assert.match(html, /<h3[^>]*>2\. Scope and human control<\/h3>/);
  assert.match(
    html,
    /<strong>AI agents explicitly authorised by you may create draft posts only<\/strong>/,
  );
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /<blockquote/);
  const unsafe = renderToStaticMarkup(
    createElement(TermsDocument, {
      content:
        "# Terms\n\n<script>alert('unsafe')</script>\n\n[unsafe](javascript:alert(1))",
    }),
  );
  assert.ok(!unsafe.includes("<script"));
  assert.ok(!unsafe.includes('href="javascript:'));
});
test("historical plain-text snapshots retain whitespace and literal characters", () => {
  const content =
    "Original accepted terms\n\n1. Agreement\n**These literal asterisks were not Markdown.**";
  const html = renderToStaticMarkup(createElement(TermsDocument, { content }));
  assert.match(html, /^<pre /);
  assert.ok(html.includes(content));
  assert.ok(!html.includes("<strong>"));
});
