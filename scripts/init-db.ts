import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../lib/mongodb";
import { ensureIndexes } from "../models/Email";
dotenv.config({ path: process.env.MAIL_ENV_FILE || ".env.local", quiet: true });
(async () => {
  try {
    await connectDB();
    await ensureIndexes();
    console.log("Database indexes ready.");
  } catch {
    console.error(
      "Unable to initialize database. Check server configuration and database connectivity.",
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
