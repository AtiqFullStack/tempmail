import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
export const metadata: Metadata = {
  metadataBase: new URL("https://mailizator.com"),
  title: {
    default: "Mailizator — A little less inbox clutter.",
    template: "%s · Mailizator",
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
       <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2805847534894674"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
    </html>
  );
}
