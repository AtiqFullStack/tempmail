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
test("sanitizer removes scripts, trackers, CSS, forms, SVG and unsafe URLs", () => {
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
