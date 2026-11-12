import { api, json } from "@/lib/api";
import { getEmail } from "@/lib/mail-service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(request, async () => json(await getEmail((await params).id)));
}
