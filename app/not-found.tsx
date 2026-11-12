import Link from "next/link";
import { Header, Footer } from "@/components/shell";
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="container not-found">
        <span className="small-label section-kicker">404 · A WRONG TURN</span>
        <h1>This inbox name doesn&apos;t quite fit.</h1>
        <p>
          Use 1–64 letters, numbers, dots, underscores, + or hyphens. Start and
          end with a letter or number.
        </p>
        <Link href="/" className="button primary">
          Choose a fresh address
        </Link>
      </main>
      <Footer />
    </>
  );
}
