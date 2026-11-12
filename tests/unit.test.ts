import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUsername, validateRecipient } from "../lib/validation";
import { sanitizeEmail, safeFilename, isSafeAttachment } from "../lib/security";
import { parseMail, MailError } from "../lib/ingest";
import { readFile } from "node:fs/promises";
test("username validation is bounded, canonical, and rejects path/HTML injection", () => {
  for (const name of ["a", "test123", "a.b_c-d+e", "ALEX", "a".repeat(64)])
    assert.equal(normalizeUsername(name), name.toLowerCase());
  for (const name of [
    "",
    " a",
    "a ",
    "../etc",
    "a/b",
    ".alex",
    "a.",
    "a@b",
    "a".repeat(65),
    "<script>",
    "hello\n",
    "é",
  ])
    assert.throws(() => normalizeUsername(name));
});
test("envelope validation only accepts the configured domain", () => {
  assert.equal(
    validateRecipient("ALEX@EMAIL.FZEETECHZ.COM", "email.fzeetechz.com"),
    "alex@email.fzeetechz.com",
  );
  for (const address of [
    "a@gmail.com",
    "a@email.fzeetechz.com.evil",
    "a@b@email.fzeetechz.com",
    "a",
    "@email.fzeetechz.com",
  ])
    assert.throws(() => validateRecipient(address, "email.fzeetechz.com"));
});
test("sanitizer removes scripts, trackers, unsafe CSS, forms, SVG and unsafe URLs", () => {
  const result = sanitizeEmail(
    '<script>alert(1)</script><img src="https://tracker"><svg onload="alert(1)"></svg><p onclick="alert(1)" style="background:url(https://tracker)">Hello</p><iframe src="https://evil"></iframe><form action="https://evil"><input></form><a href="javascript:alert(1)">bad</a><a href="//evil">bad</a><a href="https://example.org">ok</a>',
  );
  assert.match(result, /<p>Hello<\/p>/);
  assert.doesNotMatch(
    result,
    /script|img|tracker|svg|onclick|style|iframe|form|input|javascript|href="\/\//,
  );
  assert.match(result, /noopener noreferrer nofollow/);
});
test("attachment names and allowed types are constrained", () => {
  assert.equal(safeFilename("../../etc/passwd\r\n"), "__.._etc_passwd__");
  assert.equal(isSafeAttachment("application/javascript", "file.txt"), false);
  assert.equal(isSafeAttachment("text/plain", "file.exe.txt"), false);
  assert.equal(isSafeAttachment("text/plain", "notes.txt"), true);
});
test("MIME parser decodes Unicode and attachments and bounds input", async () => {
  const mail = await parseMail(await readFile("tests/fixtures/sample.eml"));
  assert.equal(mail.subject, "Hello 🌏");
  assert.match(mail.from!.text, /Olá/);
  assert.equal(mail.attachments.length, 2);
  assert.match(mail.text!, /real ingestion fixture/);
  await assert.rejects(
    parseMail(Buffer.alloc(3 * 1024 * 1024)),
    (e: unknown) => e instanceof MailError && e.exitCode === 65,
  );
});

test("email sanitizer retains inline template layout, typography, colors and borders", () => {
  const result = sanitizeEmail(
    '<div style="max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;background-color:#ffffff"><h2 style="color:#4f46e5;font-size:20px">Example Portal</h2><p style="color:#4f46e5;font-size:36px;font-weight:700;letter-spacing:8px;line-height:1.5;text-align:center">123456</p></div>',
  );
  for (const style of [
    "max-width:480px",
    "margin:0 auto",
    "padding:24px",
    "border:1px solid #e2e8f0",
    "border-radius:8px",
    "background-color:#ffffff",
    "color:#4f46e5",
    "font-size:36px",
    "font-weight:700",
    "letter-spacing:8px",
    "line-height:1.5",
    "text-align:center",
  ])
    assert.ok(result.includes(style), `Missing safe style: ${style}`);
});

test("embedded email styles are inlined before sanitizing, including body and table layout", async () => {
  const mail = await parseMail(
    await readFile("tests/fixtures/styled-email.eml"),
  );
  const result = sanitizeEmail(mail.html || "");
  assert.match(result, /font-size:36px/);
  assert.match(result, /letter-spacing:8px/);
  assert.match(result, /color:#4f46e5/);
  assert.match(result, /line-height:1.5/);
  assert.match(result, /background-color:#f8fafc/);
  assert.match(result, /<table[^>]*width="100%"/);
  assert.match(result, /<td[^>]*align="center"/);
  assert.doesNotMatch(result, /<style|class=|<title/);
});

test("CSS cannot fetch resources, execute code, position overlays, or escape the message", () => {
  const result = sanitizeEmail(
    `<html><head><link rel="stylesheet" href="https://tracker.invalid/style.css"><style>@import url(https://tracker.invalid/import.css); @font-face{font-family:tracking;src:url(https://tracker.invalid/font.woff)} .unsafe {background-image:url(https://tracker.invalid/pixel);position:fixed;inset:0;z-index:9999;animation:spin 1s infinite} .safe {color:#123456;font-size:18px}</style></head><body><div class="unsafe safe" style="background:url(https://tracker.invalid/inline);color:expression(alert(1));width:expression(alert(1));--tracking:url(https://tracker.invalid/custom);filter:url(https://tracker.invalid/filter);behavior:url(evil.htc);cursor:url(https://tracker.invalid/cursor),auto" onclick="alert(1)">Safe content</div><img src="https://tracker.invalid/image"><iframe src="https://tracker.invalid/frame"></iframe></body></html>`,
  );
  assert.match(result, /font-size:18px/);
  assert.doesNotMatch(
    result,
    /tracker|url\(|expression|position|inset|z-index|animation|filter|behavior|cursor|onclick|<link|<style|<img|<iframe|--tracking/,
  );
  const escaped = sanitizeEmail(
    String.raw`<p style="background:u\72l(https://tracker.invalid);font-family:u\72l(https://tracker.invalid);color:var(--tracking)">Text</p>`,
  );
  assert.equal(escaped, "<p>Text</p>");
});

test("HTML document keeps a restrictive independent CSP and light email canvas", async () => {
  const { emailDocument } = await import("../lib/email-document");
  const document = emailDocument(
    sanitizeEmail('<p style="color:#4f46e5">Styled</p>'),
  );
  assert.match(document, /default-src 'none'/);
  assert.match(document, /img-src 'none'/);
  assert.match(document, /connect-src 'none'/);
  assert.match(document, /font-src 'none'/);
  assert.match(document, /form-action 'none'/);
  assert.match(document, /color-scheme:light/);
  assert.match(document, /color:#4f46e5/);
});

test("oversized stylesheets fall back to safe inline presentation without expanding CSS", () => {
  const result = sanitizeEmail(
    "<style>.code{font-size:36px}/*" +
      "x".repeat(9000) +
      '*/</style><p class="code" style="color:#4f46e5">123456</p>',
  );
  assert.match(result, /color:#4f46e5/);
  assert.doesNotMatch(result, /font-size|<style|class=/);
});
