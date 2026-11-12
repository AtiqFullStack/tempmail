import { createHash } from "node:crypto";
import { connectDB } from "./mongodb";
import { config } from "./config";
import { RateBucket } from "../models/Email";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function api(request: Request, work: () => Promise<Response>) {
  try {
    await connectDB();
    // Only trust this header behind our loopback-bound server and overwriting Nginx proxy.
    const ip =
      config().TRUST_PROXY === "true"
        ? request.headers.get("x-real-ip") || "unknown"
        : "direct";
    const minute = Math.floor(Date.now() / 60000);
    const key = createHash("sha256").update(`${ip}:${minute}`).digest("hex");
    const bucket = await RateBucket.findOneAndUpdate(
      { _id: key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((minute + 2) * 60000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (bucket.count > 120)
      return new Response(
        JSON.stringify({ error: "Too many requests. Try again shortly." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Retry-After": "60",
          },
        },
      );
    return await work();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("API request failed", {
      kind: e instanceof Error ? e.name : "UnknownError",
    });
    return json(
      { error: "Mail service is temporarily unavailable. Please try again." },
      503,
    );
  }
}
