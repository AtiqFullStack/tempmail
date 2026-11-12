import { Email } from "../models/Email";
import { config } from "./config";
import { normalizeUsername, validId } from "./validation";
import { HttpError } from "./api";
export const liveFilter = (now = new Date()) => ({ expiresAt: { $gt: now } });
export async function listInbox(username: string, url: URL) {
  let name: string;
  try {
    name = normalizeUsername(username);
  } catch {
    throw new HttpError(400, "Invalid inbox name");
  }
  const pageString = url.searchParams.get("page") || "1";
  const limitString = url.searchParams.get("limit") || "20";
  const sort = url.searchParams.get("sort") || "desc";
  if (!/^\d{1,4}$/.test(pageString) || !/^\d{1,2}$/.test(limitString))
    throw new HttpError(400, "Invalid pagination");
  const page = Number(pageString),
    limit = Number(limitString);
  if (
    page < 1 ||
    page > 1000 ||
    limit < 1 ||
    limit > 50 ||
    !["asc", "desc"].includes(sort)
  )
    throw new HttpError(400, "Invalid pagination or sort");
  const filter = {
    envelopeRecipient: `${name}@${config().MAIL_DOMAIN}`,
    ...liveFilter(),
  };
  const [messages, total] = await Promise.all([
    Email.find(filter)
      .select(
        "from subject preview receivedAt expiresAt attachments._id attachments.filename attachments.contentType attachments.size",
      )
      .sort({
        receivedAt: sort === "asc" ? 1 : -1,
        _id: sort === "asc" ? 1 : -1,
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Email.countDocuments(filter),
  ]);
  return { messages, total, page, limit, hasMore: page * limit < total };
}
export async function getEmail(id: string) {
  if (!validId(id)) throw new HttpError(400, "Invalid message ID");
  const message = await Email.findOne({ _id: id, ...liveFilter() })
    .select(
      "from to cc subject text sanitizedHtml envelopeRecipient receivedAt expiresAt attachments._id attachments.filename attachments.contentType attachments.size",
    )
    .lean();
  if (!message) throw new HttpError(404, "Message expired or not found");
  return message;
}
