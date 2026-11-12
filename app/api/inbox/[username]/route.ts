import { api, json } from "@/lib/api";
import { listInbox } from "@/lib/mail-service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  return api(request, async () =>
    json(await listInbox((await params).username, new URL(request.url))),
  );
}
