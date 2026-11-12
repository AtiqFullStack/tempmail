import mongoose from "mongoose";
import { config } from "./config";
let pending: Promise<typeof mongoose> | undefined;
export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose;
  pending ??= mongoose
    .connect(config().MONGODB_URI, {
      maxPoolSize: 8,
      serverSelectionTimeoutMS: 4000,
      socketTimeoutMS: 15000,
      autoIndex: false,
    })
    .catch((e) => {
      pending = undefined;
      throw e;
    });
  return pending;
}
