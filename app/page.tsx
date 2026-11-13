import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Clock3,
  Feather,
  Inbox,
  Leaf,
  Mail,
  MousePointer2,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Header, Footer } from "@/components/shell";
import AddressForm from "@/components/address-form";
const faqs = [
  [
    "What is a temporary email address?",
    "It's a receive-only address you can use without an account. Pick any valid inbox name and messages sent to it will appear here. Each message expires automatically, one hour after arrival by default.",
  ],
  [
    "Are my messages private?",
    "No. All inboxes are public. Anyone who knows or guesses an inbox name can read its emails and download its allowed attachments. Use a random name to reduce accidental overlap, but never treat it as a password.",
  ],
  [
    "How long do emails stay in my inbox?",
    "Messages are visible until their individual expiration time, shown in the inbox. The default is one hour after receipt. Expired messages are hidden immediately; database cleanup happens shortly afterward.",
  ],
  [
    "Can I send or reply to an email?",
    "No. Mailizator only receives email. Sending, replies, and forwarding are not supported.",
  ],
  [
    "What can I use Mailizator for?",
    "Try out a service, receive a non-sensitive download link, or test your own email integration. Some services block temporary email addresses. Avoid banking, account recovery, personal documents, and anything you need to keep.",
  ],
  [
    "Can I download attachments?",
    "Common image files, PDFs, and plain text or CSV files are available as downloads. Scripts, executables, archives, and other unsupported file types are discarded. Downloads are not virus-scanned, so only open files you trust.",
  ],
];
export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero container">
          <div className="hero-decoration decoration-left">
            <AtSign />
            <span className="decor-orbit" />
          </div>
          <div className="hero-decoration decoration-right">
            <Mail />
            <span className="decor-star">✳</span>
          </div>
          <div className="eyebrow">
            <span className="eyebrow-icon">
              <Leaf size={13} />
            </span>{" "}
            A FRESH ADDRESS. A LIGHTER INBOX.
          </div>
          <h1>
            Keep the email.
            <br />
            <span>Skip the clutter.</span>
            <svg
              className="hero-underline"
              viewBox="0 0 360 15"
              aria-hidden="true"
            >
              <path d="M3 10 Q170 -2 355 7 M30 14 Q180 6 327 11" />
            </svg>
          </h1>
          <p className="hero-description">
            For the sign-ups, the downloads, and the just-this-once.
            <br className="desktop-break" /> Get a temporary email and give your
            real inbox a break.
          </p>
          <AddressForm />
          <a className="scroll-hint" href="#how-it-works">
            LESS CLUTTER STARTS HERE <ArrowDown size={13} />
          </a>
        </section>
        <section className="benefits-strip">
          <div className="container benefits-inner">
            <span>
              <Feather />
              Light on commitment
            </span>
            <span>
              <Clock3 />
              Messages expire automatically
            </span>
            <span>
              <ShieldCheck />
              No personal details required
            </span>
            <span>
              <Inbox />
              Ready when you are
            </span>
          </div>
        </section>
        <section id="how-it-works" className="container how-section">
          <div className="section-intro">
            <div>
              <span className="small-label section-kicker">
                SMALL EFFORT. FRESH START.
              </span>
              <h2>Three steps. Zero baggage.</h2>
            </div>
            <p>
              No account to create. No password to remember.
              <br />
              Just an inbox that does its thing.
            </p>
          </div>
          <div className="steps">
            <article className="step">
              <div className="step-top">
                <span className="step-icon">
                  <AtSign size={25} />
                </span>
                <span className="step-number">01</span>
              </div>
              <h3>Pick your address</h3>
              <p>
                Choose a name or generate a random one. Your temporary inbox is
                ready instantly.
              </p>
            </article>
            <span className="step-connector">
              <ArrowRight size={20} />
            </span>
            <article className="step">
              <div className="step-top">
                <span className="step-icon">
                  <MousePointer2 size={25} />
                </span>
                <span className="step-number">02</span>
              </div>
              <h3>Use it wherever</h3>
              <p>
                Copy your address for a quick sign-up, a trial, or that download
                you came for.
              </p>
            </article>
            <span className="step-connector">
              <ArrowRight size={20} />
            </span>
            <article className="step">
              <div className="step-top">
                <span className="step-icon">
                  <Mail size={25} />
                </span>
                <span className="step-number">03</span>
              </div>
              <h3>Get it. Then forget it.</h3>
              <p>
                Read incoming mail right here. Messages expire automatically,
                leaving less behind.
              </p>
            </article>
          </div>
        </section>
        <section className="container privacy-section" id="privacy">
          <div className="privacy-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <span className="art-leaf">
              <Leaf size={60} strokeWidth={1.2} />
            </span>
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">✦</span>
            <span className="art-badge">
              <Clock3 size={15} /> HERE FOR A LITTLE WHILE
            </span>
          </div>
          <div className="privacy-copy">
            <span className="small-label section-kicker">
              A LITTLE TRANSPARENCY
            </span>
            <h2>
              Temporary by nature.
              <br />
              Public by design.
            </h2>
            <p>
              Less commitment doesn&apos;t mean less clarity. Every inbox is
              public, and anyone with its name can open it.
            </p>
            <p>
              Keep personal details, passwords, and sensitive information in
              your regular inbox. This one&apos;s for the little things.
            </p>
            <a href="#faq" className="text-link">
              Know your inbox <ArrowUpRight size={17} />
            </a>
          </div>
        </section>
        <section id="faq" className="container faq-section">
          <div className="faq-intro">
            <span className="small-label section-kicker">GOOD TO KNOW</span>
            <h2>
              A few things
              <br />
              you might be wondering.
            </h2>
            <p>
              A temporary inbox.
              <br />
              No lasting questions.
            </p>
            <Sparkles className="faq-spark" size={35} strokeWidth={1} />
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="container final-cta">
          <div>
            <span className="small-label section-kicker">
              GIVE YOUR INBOX SOME SPACE
            </span>
            <h2>A fresh address is a click away.</h2>
          </div>
          <Link
            href="#get-address"
            className="button primary"
            style={{
              color: "white",
            }}
          >
            Get my temporary email <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
