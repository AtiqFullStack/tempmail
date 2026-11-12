import { simpleParser } from "mailparser";
import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { config } from "./config";
import { connectDB } from "./mongodb";
import { Email, Receipt, IngestLock, ensureIndexes } from "../models/Email";
import { validateRecipient } from "./validation";
import { sanitizeEmail, safeFilename, isSafeAttachment } from "./security";
export class MailError extends Error {
  constructor(
    message: string,
    public exitCode: number,
  ) {
    super(message);
  }
}
export async function parseMail(raw: Buffer) {
  if (raw.length > config().MAX_EMAIL_SIZE_MB * 1024 * 1024)
    throw new MailError("Message exceeds size limit", 65);
  if (
    !/^[!-9;-~]+:/.test(raw.toString("utf8", 0, Math.min(raw.length, 1024))) ||
    !/\r?\n\r?\n/.test(raw.toString("utf8"))
  )
    throw new MailError("Malformed MIME message", 65);
  try {
    return await simpleParser(raw, {
      skipHtmlToText: false,
      skipTextToHtml: true,
      skipImageLinks: true,
      maxHtmlLengthToParse: 1024 * 1024,
    });
  } catch {
    throw new MailError("Malformed MIME message", 65);
  }
}
export async function ingest(
  raw: Buffer,
  recipients: string[],
  sender: string,
) {
  const cfg = config();
  if (!recipients.length || recipients.length > 50)
    throw new MailError("Invalid recipient count", 65);
  let addresses: string[];
  try {
    addresses = [
      ...new Set(recipients.map((r) => validateRecipient(r, cfg.MAIL_DOMAIN))),
    ];
  } catch {
    throw new MailError("Unsupported recipient", 67);
  }
  const parsed = await parseMail(raw);
  if (parsed.attachments.length > 20)
    throw new MailError("Too many MIME attachments", 65);
  const attachments = parsed.attachments
    .filter((a) => isSafeAttachment(a.contentType, a.filename || "attachment"))
    .map((a) => ({
      _id: new mongoose.Types.ObjectId(),
      filename: safeFilename(a.filename || "attachment"),
      contentType: a.contentType,
      size: a.size,
      data: a.content,
    }));
  const html = sanitizeEmail(parsed.html || "");
  const text = (parsed.text || "").slice(0, 2 * 1024 * 1024);
  const size =
    Buffer.byteLength(text + html) +
    attachments.reduce((n, a) => n + a.size, 0) +
    8192;
  await connectDB();
  await ensureIndexes();
  const owner = randomUUID();
  // A shared MongoDB lease serializes quota admission across Postfix processes.
  try {
    await IngestLock.create({ _id: "storage", owner: "", until: new Date(0) });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
  }
  const acquired = await IngestLock.findOneAndUpdate(
    { _id: "storage", until: { $lt: new Date() } },
    { $set: { owner, until: new Date(Date.now() + 60000) } },
  );
  if (!acquired) throw new MailError("Storage is busy, retry later", 75);
  try {
    for (const recipient of addresses) {
      // Hash the delivered bytes and envelope, never the forgeable Message-ID.
      const deliveryId = createHash("sha256")
        .update(raw)
        .update("\0" + sender + "\0" + recipient)
        .digest("hex");
      const receipt = await Receipt.findById(deliveryId);
      // Older receipts without a state were only created after successful storage.
      if (receipt && receipt.completed !== false) continue;
      if (!(await Email.exists({ deliveryId }))) {
        const usage = await Email.aggregate([
          { $group: { _id: null, bytes: { $sum: "$size" } } },
        ]).option({ maxTimeMS: 5000 });
        if ((usage[0]?.bytes || 0) + size > cfg.MAX_STORED_BYTES)
          throw new MailError("Storage quota reached", 75);
        if (
          !(await IngestLock.exists({
            _id: "storage",
            owner,
            until: { $gt: new Date(Date.now() + 15000) },
          }))
        )
          throw new MailError("Storage lease expired", 75);
        const now = receipt?.receivedAt || new Date();
        const messageExpiresAt =
          receipt?.messageExpiresAt ||
          new Date(now.getTime() + cfg.MAIL_RETENTION_HOURS * 3600000);
        // Persist the original lifetime before the message write. A crash in
        // either subsequent write must never reset expiry on the next retry.
        await Receipt.updateOne(
          { _id: deliveryId },
          {
            $setOnInsert: {
              completed: false,
              receivedAt: now,
              messageExpiresAt,
              expiresAt: new Date(now.getTime() + 7 * 86400000),
            },
          },
          { upsert: true, writeConcern: { w: "majority", j: true } },
        );
        await Email.create(
          [
            {
              deliveryId,
              messageId: (parsed.messageId || "").slice(0, 998),
              envelopeSender: sender.slice(0, 320),
              envelopeRecipient: recipient,
              from: parsed.from?.text.slice(0, 2000) || "Unknown sender",
              to: Array.isArray(parsed.to)
                ? parsed.to
                    .map((t) => t.text)
                    .join(", ")
                    .slice(0, 4000)
                : parsed.to?.text.slice(0, 4000) || "",
              cc: Array.isArray(parsed.cc)
                ? parsed.cc
                    .map((t) => t.text)
                    .join(", ")
                    .slice(0, 4000)
                : parsed.cc?.text.slice(0, 4000) || "",
              subject: (parsed.subject || "(No subject)").slice(0, 998),
              text,
              sanitizedHtml: html,
              preview: text.replace(/\s+/g, " ").slice(0, 180),
              attachments,
              size,
              receivedAt: now,
              expiresAt: messageExpiresAt,
            },
          ],
          { writeConcern: { w: "majority", j: true } },
        );
      }
      await Receipt.updateOne(
        { _id: deliveryId },
        {
          $set: { completed: true },
          $setOnInsert: { expiresAt: new Date(Date.now() + 7 * 86400000) },
        },
        { upsert: true, writeConcern: { w: "majority", j: true } },
      );
    }
  } finally {
    await IngestLock.updateOne(
      { _id: "storage", owner },
      { $set: { until: new Date(0) } },
    );
  }
}
