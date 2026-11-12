import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { ingest } from "../lib/ingest";
import { config } from "../lib/config";
import { Email } from "../models/Email";
dotenv.config({ path: process.env.MAIL_ENV_FILE || ".env.local", quiet: true });
(async () => {
  try {
    const recipient = `local-test@${config().MAIL_DOMAIN}`;
    await ingest(
      await readFile("tests/fixtures/sample.eml"),
      [recipient],
      "sender@example.org",
    );
    const count = await Email.countDocuments({
      envelopeRecipient: recipient,
      expiresAt: { $gt: new Date() },
    });
    if (!count)
      throw new Error(
        "No message persisted; use a new fixture Message-ID after an expired test.",
      );
    console.log(
      `Verified ${count} persisted message(s). Open /inbox/local-test to read the sample.`,
    );
  } catch {
    console.error(
      "Local ingestion failed. Check MongoDB and .env.local; retrying the same fixture is idempotent.",
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
