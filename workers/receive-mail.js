#!/usr/bin/env node
// Run with: node --import tsx workers/receive-mail.js --sender=... --recipient=...

(async () => {
 (await import("dotenv")).default.config({ path: process.env.MAIL_ENV_FILE || ".env.local", quiet: true });
 const ingestModule = await import("../lib/ingest.ts");
 const { ingest, MailError } = ingestModule.default || ingestModule;
 const configModule = await import("../lib/config.ts");
 const { config } = configModule.default || configModule;
 const mongoose = (await import("mongoose")).default;
 const timeout = setTimeout(() => { console.error("4.3.0 Processing timeout"); process.exit(75); }, 45000);
 try {
  const args = process.argv.slice(2);
  if (args.some(a => !a.startsWith("--sender=") && !a.startsWith("--recipient="))) throw new MailError("Invalid worker arguments", 64);
  const recipients = args.filter(a => a.startsWith("--recipient=")).map(a => a.slice(12));
  const sender = args.find(a => a.startsWith("--sender="))?.slice(9) || "";
  const limit = config().MAX_EMAIL_SIZE_MB * 1024 * 1024;
  let length = 0;
  const chunks = [];
  for await (const chunk of process.stdin) { length += chunk.length; if (length > limit) throw new MailError("Message exceeds size limit", 65); chunks.push(chunk); }
  await ingest(Buffer.concat(chunks), recipients, sender);
  process.exitCode = 0;
 } catch (error) {
  const code = error instanceof MailError ? error.exitCode : 75;
  console.error(code === 75 ? "4.3.0 Temporary storage failure" : "5.6.0 Invalid message or recipient");
  process.exitCode = code;
 } finally { clearTimeout(timeout); await mongoose.disconnect(); }
})().catch(() => { console.error("4.3.0 Worker initialization failed"); process.exitCode = 75; });
