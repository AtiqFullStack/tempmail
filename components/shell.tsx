"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Mail, Moon, Sun } from "lucide-react";
export function Header() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const value = localStorage.getItem("tempmail-theme") === "dark";
      document.documentElement.dataset.theme = value ? "dark" : "light";
      const frame = requestAnimationFrame(() => setDark(value));
      return () => cancelAnimationFrame(frame);
    } catch {}
  }, []);
  function toggle() {
    const value = document.documentElement.dataset.theme !== "dark";
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    try {
      localStorage.setItem("tempmail-theme", value ? "dark" : "light");
    } catch {}
  }
  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand" aria-label="Mailizator home">
          <span className="brand-icon">
            <Mail size={23} />
          </span>
          maili<span className="brand-light">zator</span>
          <span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#privacy">Your privacy</Link>
          <Link href="/#faq">FAQs</Link>
        </nav>
        <div className="nav-actions">
          <button
            className="icon-button theme-toggle"
            onClick={toggle}
            aria-label="Toggle color theme"
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <Link className="nav-cta" href="/#get-address">
            Get an inbox <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="container footer-top">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Mail size={21} />
          </span>
          maili<span className="brand-light">zator</span>
          <span className="brand-dot">.</span>
        </Link>
        <p>A little less clutter. A little more breathing room.</p>
        <Link href="/#privacy">
          Public by design <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} Fzeetechz Pvt Ltd. Made for a lighter
          inbox.
        </span>
        <span>Receive only. No registration. No fuss.</span>
      </div>
    </footer>
  );
}
export function Toast({ message }: { message: string }) {
  return (
    <div
      className={`toast ${message ? "visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
export async function copyAddress(
  address: string,
  notify: (message: string) => void,
) {
  try {
    await navigator.clipboard.writeText(address);
    notify("Email address copied to clipboard");
  } catch {
    notify("Could not copy. Select and copy the address manually.");
  }
}
