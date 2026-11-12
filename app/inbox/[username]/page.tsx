import { notFound } from "next/navigation";
import { normalizeUsername } from "@/lib/validation";
import InboxClient from "@/components/inbox-client";
export const metadata = {
  title: "Public inbox",
  robots: { index: false, follow: false },
};
export default async function InboxPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  let name: string;
  try {
    name = normalizeUsername(username);
  } catch {
    notFound();
  }
  return <InboxClient username={name} />;
}
