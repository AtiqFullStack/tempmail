import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { ingest, MailError } from "../lib/ingest";
import { connectDB } from "../lib/mongodb";
import { Email, Receipt, RateBucket, ensureIndexes } from "../models/Email";
import { GET as inboxGET } from "../app/api/inbox/[username]/route";
import { GET as detailGET } from "../app/api/emails/[id]/route";
import { GET as attachmentGET } from "../app/api/emails/[id]/attachments/[attachmentId]/route";
import { GET as healthGET } from "../app/api/health/route";
let server: MongoMemoryServer;
let raw: Buffer;
before(async () => {
  server = await MongoMemoryServer.create({ binary: { version: "8.0.17" } });
  process.env.MONGODB_URI = server.getUri("tempmail_test");
  process.env.MAIL_DOMAIN = "email.fzeetechz.com";
  process.env.NEXT_PUBLIC_MAIL_DOMAIN = "email.fzeetechz.com";
  await connectDB();
  await ensureIndexes();
  raw = await readFile("tests/fixtures/sample.eml");
});
after(async () => {
  await mongoose.disconnect();
  await server?.stop();
});
const inbox = (name: string, query = "") =>
  inboxGET(new Request(`http://localhost/api/inbox/${name}${query}`), {
    params: Promise.resolve({ username: name }),
  });
function worker(args: string[], payload: Buffer, env = {}) {
  return new Promise<{ code: number | null; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "workers/receive-mail.js", ...args],
        { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.stdin.on("error", () => {});
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
      child.stdin.end(payload);
    },
  );
}
test("durable ingestion respects envelope, Unicode, safe attachments, duplicates and multiple recipients", async () => {
  await ingest(
    raw,
    [
      "alice@email.fzeetechz.com",
      "BOB@email.fzeetechz.com",
      "alice@email.fzeetechz.com",
    ],
    "sender@example.org",
  );
  assert.equal(await Email.countDocuments(), 2);
  await ingest(
    raw,
    ["alice@email.fzeetechz.com", "bob@email.fzeetechz.com"],
    "sender@example.org",
  );
  assert.equal(await Email.countDocuments(), 2);
  assert.equal(await Receipt.countDocuments(), 2);
  const message = await Email.findOne({
    envelopeRecipient: "alice@email.fzeetechz.com",
  }).select("+attachments.data");
  assert.equal(message.subject, "Hello 🌏");
  assert.match(message.to, /wrong-header/);
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0].filename, "readme.txt");
  assert.doesNotMatch(message.sanitizedHtml, /<script|<img|javascript:/);
  assert.ok(Math.abs(message.expiresAt - message.receivedAt - 3600000) < 100);
  assert.ok(
    Buffer.from(message.attachments[0].data)
      .toString()
      .includes("safe test attachment"),
  );
});
test("inbox API projects safely, paginates, sorts, validates and health pings MongoDB", async () => {
  const response = await inbox("ALICE");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(body.messages.length, 1);
  assert.match(body.messages[0].attachments[0]._id, /^[a-f0-9]{24}$/);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(
    serialized,
    /deliveryId|envelopeSender|storage|sanitizedHtml|VGhpcy/,
  );
  assert.equal((await inbox("alice", "?page=2&limit=1&sort=asc")).status, 200);
  assert.equal(
    (await (await inbox("alice", "?page=2&limit=1")).json()).messages.length,
    0,
  );
  for (const query of ["?page=0", "?limit=51", "?sort=bad", "?page=1.2"])
    assert.equal((await inbox("alice", query)).status, 400);
  assert.equal((await inbox("../evil")).status, 400);
  const health = await healthGET(new Request("http://localhost/api/health"));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
});
test("detail and attachment APIs hide internals and force safe download", async () => {
  const email = await Email.findOne({
    envelopeRecipient: "alice@email.fzeetechz.com",
  });
  const id = String(email._id),
    attachmentId = String(email.attachments[0]._id);
  const response = await detailGET(
    new Request(`http://localhost/api/emails/${id}`),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.subject, "Hello 🌏");
  assert.match(body.attachments[0]._id, /^[a-f0-9]{24}$/);
  assert.equal(body.attachments[0].data, undefined);
  assert.equal(body.envelopeSender, undefined);
  const attachment = await attachmentGET(
    new Request("http://localhost/download"),
    { params: Promise.resolve({ id, attachmentId }) },
  );
  assert.equal(attachment.status, 200);
  assert.equal(
    attachment.headers.get("Content-Type"),
    "application/octet-stream",
  );
  assert.match(attachment.headers.get("Content-Disposition")!, /attachment;/);
  assert.match(await attachment.text(), /safe test attachment/);
  const invalid = await detailGET(new Request("http://localhost"), {
    params: Promise.resolve({ id: "bad" }),
  });
  assert.equal(invalid.status, 400);
});
test("expired messages are immediately hidden in list/detail/download before TTL cleanup; retries do not resurrect them", async () => {
  const email = await Email.findOne({
    envelopeRecipient: "alice@email.fzeetechz.com",
  });
  const id = String(email._id),
    attachmentId = String(email.attachments[0]._id);
  await Email.updateOne(
    { _id: id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await (await inbox("alice")).json()).total, 0);
  assert.equal(
    (
      await detailGET(new Request("http://localhost"), {
        params: Promise.resolve({ id }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await attachmentGET(new Request("http://localhost"), {
        params: Promise.resolve({ id, attachmentId }),
      })
    ).status,
    404,
  );
  await Email.deleteOne({ _id: id });
  await ingest(raw, ["alice@email.fzeetechz.com"], "sender@example.org");
  assert.equal(
    await Email.countDocuments({
      envelopeRecipient: "alice@email.fzeetechz.com",
    }),
    0,
  );
});
test("worker acknowledges persisted success and uses permanent vs temporary failure exit codes", async () => {
  const success = await worker(
    ["--sender=sender@example.org", "--recipient=worker@email.fzeetechz.com"],
    raw,
  );
  assert.equal(success.code, 0, success.stderr);
  assert.equal(
    await Email.countDocuments({
      envelopeRecipient: "worker@email.fzeetechz.com",
    }),
    1,
  );
  const retry = await worker(
    ["--sender=sender@example.org", "--recipient=worker@email.fzeetechz.com"],
    raw,
  );
  assert.equal(retry.code, 0);
  assert.equal(
    await Email.countDocuments({
      envelopeRecipient: "worker@email.fzeetechz.com",
    }),
    1,
  );
  assert.equal((await worker(["--recipient=a@evil.com"], raw)).code, 67);
  assert.equal(
    (
      await worker(
        ["--recipient=bad@email.fzeetechz.com"],
        Buffer.from("not an email"),
      )
    ).code,
    65,
  );
  assert.equal((await worker(["--unknown=1"], raw)).code, 64);
  assert.equal(
    (
      await worker(
        ["--recipient=big@email.fzeetechz.com"],
        Buffer.alloc(3 * 1024 * 1024),
      )
    ).code,
    65,
  );
  assert.equal(
    (
      await worker(["--recipient=temp@email.fzeetechz.com"], raw, {
        MONGODB_URI: "mongodb://127.0.0.1:1/failure",
      })
    ).code,
    75,
  );
});
test("global storage admission defers excess mail rather than acknowledging or storing it", async () => {
  const previous = process.env.MAX_STORED_BYTES;
  process.env.MAX_STORED_BYTES = "1048576";
  const big = Buffer.from(
    "From: test@example.org\r\nSubject: Quota\r\n\r\n" + "x".repeat(1100000),
  );
  await assert.rejects(
    ingest(big, ["quota@email.fzeetechz.com"], "sender@example.org"),
    (e: unknown) => e instanceof MailError && e.exitCode === 75,
  );
  assert.equal(
    await Email.countDocuments({
      envelopeRecipient: "quota@email.fzeetechz.com",
    }),
    0,
  );
  if (previous) process.env.MAX_STORED_BYTES = previous;
  else delete process.env.MAX_STORED_BYTES;
});
test("interrupted delivery receipts preserve original expiry even after TTL cleanup", async () => {
  const recipient = "interrupted@email.fzeetechz.com";
  await ingest(raw, [recipient], "sender@example.org");
  const email = await Email.findOne({ envelopeRecipient: recipient });
  const receivedAt = new Date(Date.now() - 2 * 3600000);
  const messageExpiresAt = new Date(Date.now() - 3600000);
  // Simulate a crash after the message write, before marking the receipt complete,
  // followed by a long deferral during which MongoDB removes the expired message.
  await Receipt.updateOne(
    { _id: email.deliveryId },
    { $set: { completed: false, receivedAt, messageExpiresAt } },
  );
  await Email.deleteOne({ _id: email._id });
  await ingest(raw, [recipient], "sender@example.org");
  const replay = await Email.findOne({ envelopeRecipient: recipient });
  assert.equal(replay.expiresAt.getTime(), messageExpiresAt.getTime());
  assert.equal((await (await inbox("interrupted")).json()).total, 0);
  assert.equal((await Receipt.findById(email.deliveryId)).completed, true);
});

test("styled MIME persists and the detail API retains safe presentation CSS", async () => {
  await ingest(
    await readFile("tests/fixtures/styled-email.eml"),
    ["styled-test@email.fzeetechz.com"],
    "sender@example.org",
  );
  const email = await Email.findOne({
    envelopeRecipient: "styled-test@email.fzeetechz.com",
  });
  const response = await detailGET(new Request("http://localhost"), {
    params: Promise.resolve({ id: String(email._id) }),
  });
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.match(detail.sanitizedHtml, /font-size:36px/);
  assert.match(detail.sanitizedHtml, /letter-spacing:8px/);
  assert.match(detail.sanitizedHtml, /color:#4f46e5/);
  assert.match(detail.sanitizedHtml, /max-width:480px/);
  assert.doesNotMatch(detail.sanitizedHtml, /<style|<script|<link/);
});

test("API rate limit is shared and returns 429 with retry-after", async () => {
  const key = (await import("node:crypto"))
    .createHash("sha256")
    .update(`direct:${Math.floor(Date.now() / 60000)}`)
    .digest("hex");
  await RateBucket.updateOne(
    { _id: key },
    { $set: { count: 120 } },
    { upsert: true },
  );
  const response = await inbox("alice");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
});
