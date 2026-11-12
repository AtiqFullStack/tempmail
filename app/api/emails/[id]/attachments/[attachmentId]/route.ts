import { api, HttpError } from "@/lib/api";
import { Email } from "@/models/Email";
import { validId } from "@/lib/validation";
import { liveFilter } from "@/lib/mail-service";
import { safeFilename, isSafeAttachment } from "@/lib/security";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  return api(request, async () => {
    const { id, attachmentId } = await params;
    if (!validId(id) || !validId(attachmentId))
      throw new HttpError(400, "Invalid attachment ID");
    const message = await Email.findOne({
      _id: id,
      ...liveFilter(),
      "attachments._id": attachmentId,
    }).select("+attachments.data");
    const file = message?.attachments.id(attachmentId);
    if (!file || !isSafeAttachment(file.contentType, file.filename))
      throw new HttpError(404, "Attachment expired or not found");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safeFilename(file.filename))}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Length": String(file.size),
      },
    });
  });
}
