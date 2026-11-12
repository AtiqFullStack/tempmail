import { api, json } from "@/lib/api";
import mongoose from "mongoose";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(request, async () => {
    await mongoose.connection.db!.admin().ping();
    return json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  });
}
