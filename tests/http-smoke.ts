// Runs against the real production Next.js server with an isolated real MongoDB.
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { ingest } from "../lib/ingest";
import { Email } from "../models/Email";
(async () => {
  const mongo = await MongoMemoryServer.create({
    binary: { version: "8.0.17" },
  });
  process.env.MONGODB_URI = mongo.getUri("http_smoke");
  process.env.MAIL_DOMAIN = "email.fzeetechz.com";
  process.env.NEXT_PUBLIC_MAIL_DOMAIN = "email.fzeetechz.com";
  process.env.TRUST_PROXY = "false";
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>((resolve) => portProbe.close(() => resolve()));
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    { env: { ...process.env, NODE_ENV: "production" }, stdio: "pipe" },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base)).status === 200) {
          ready = true;
          break;
        }
      } catch {}
      if (child.exitCode !== null)
        throw new Error("Production server exited before readiness");
      await delay(200);
    }
    assert.ok(ready, "Production server must start");
    await ingest(
      await readFile("tests/fixtures/sample.eml"),
      ["smoke@email.fzeetechz.com"],
      "sender@example.org",
    );
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Skip the clutter/);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.ok(home.headers.get("content-security-policy"));
    assert.equal((await fetch(`${base}/inbox/smoke`)).status, 200);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const list = await fetch(`${base}/api/inbox/smoke`);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get("cache-control"), "no-store");
    const data = await list.json();
    assert.equal(data.total, 1);
    const id = data.messages[0]._id;
    const detail = await fetch(`${base}/api/emails/${id}`);
    assert.equal(detail.status, 200);
    const email = await detail.json();
    assert.doesNotMatch(email.sanitizedHtml, /script|<img|javascript:/);
    const attachment = await fetch(
      `${base}/api/emails/${id}/attachments/${email.attachments[0]._id}`,
    );
    assert.equal(attachment.status, 200);
    assert.match(await attachment.text(), /safe test attachment/);
    await ingest(
      await readFile("tests/fixtures/styled-email.eml"),
      ["styled-http@email.fzeetechz.com"],
      "sender@example.org",
    );
    const styledList = await (
      await fetch(`${base}/api/inbox/styled-http`)
    ).json();
    const styledDetail = await (
      await fetch(`${base}/api/emails/${styledList.messages[0]._id}`)
    ).json();
    assert.match(styledDetail.sanitizedHtml, /font-size:36px/);
    assert.match(styledDetail.sanitizedHtml, /letter-spacing:8px/);
    assert.match(styledDetail.sanitizedHtml, /color:#4f46e5/);
    await Email.updateOne(
      { _id: id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    assert.equal(
      (await (await fetch(`${base}/api/inbox/smoke`)).json()).total,
      0,
    );
    assert.equal((await fetch(`${base}/api/emails/${id}`)).status, 404);
    console.log(
      "Production HTTP smoke passed: homepage, inbox, headers, health, persistence, API, sanitization, attachment and expiry.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : "HTTP smoke failed");
    console.error(output);
    process.exitCode = 1;
  } finally {
    const closed = once(child, "close");
    child.kill("SIGTERM");
    await closed;
    await mongoose.disconnect();
    await mongo.stop();
  }
})().catch(() => {
  console.error("HTTP smoke initialization failed");
  process.exitCode = 1;
});
