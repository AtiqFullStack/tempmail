import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "TempMail — A little less inbox clutter.",
    template: "%s · TempMail",
  },
  description:
    "An email address for the things that don't need your real one. Free public temporary inboxes with automatic message expiration.",
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
