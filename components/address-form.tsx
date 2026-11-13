"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  Shuffle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { normalizeUsername } from "@/lib/validation";
import { copyAddress, Toast } from "./shell";
export const domain = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "mailizator.com";
export function randomName() {
  const words = [
    "mint",
    "cloud",
    "fern",
    "pebble",
    "olive",
    "breeze",
    "cedar",
    "moss",
  ];
  const values = crypto.getRandomValues(new Uint32Array(2));
  return `${words[values[0] % words.length]}${values[1].toString(36).slice(0, 6)}`;
}
export default function AddressForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const router = useRouter();
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }
  function generate() {
    setName(randomName());
    setError("");
  }
  function open(event: React.FormEvent) {
    event.preventDefault();
    try {
      const username = normalizeUsername(name);
      setError("");
      router.push(`/inbox/${encodeURIComponent(username)}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <form className="address-card" id="get-address" onSubmit={open}>
        <div className="address-card-head">
          <span className="small-label">
            <span className="live-dot" /> YOUR TEMPORARY EMAIL
          </span>
          <span className="pill">No sign-up needed</span>
        </div>
        <label className="sr-only" htmlFor="username">
          Choose an inbox name
        </label>
        <div className={`address-input ${error ? "input-error" : ""}`}>
          <input
            id="username"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="your-inbox-name"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            aria-describedby={error ? "username-error" : undefined}
          />
          <span>@{domain}</span>
          <button
            type="button"
            className="icon-button copy-address"
            aria-label="Copy email address"
            onClick={() => {
              try {
                copyAddress(`${normalizeUsername(name)}@${domain}`, notify);
              } catch {
                notify("Choose or generate an inbox name first");
              }
            }}
          >
            <Copy size={19} />
          </button>
        </div>
        {error && (
          <p className="field-error" id="username-error">
            {error}
          </p>
        )}
        <div className="address-buttons">
          <button
            className="button primary"
            type="submit"
            style={{
              color: "white",
            }}
          >
            Open inbox <ArrowRight size={18} />
          </button>
          <button className="button secondary" type="button" onClick={generate}>
            <Shuffle size={17} /> Generate random
          </button>
        </div>
        <div className="address-helper">
          <Sparkles size={14} />
          <span>Make it yours, or let us pick a name.</span>
        </div>
        <div className="public-note">
          <TriangleAlert size={16} />
          <p>
            <strong>A quick heads-up:</strong> inboxes are public. Anyone with
            the address can read the messages. Never use this for sensitive
            information.
          </p>
        </div>
      </form>
      <div className="hero-checks">
        <span>
          <Check size={15} /> Free to use
        </span>
        <span>
          <Check size={15} /> No password
        </span>
        <span>
          <Check size={15} /> Emails auto-expire
        </span>
      </div>
      <Toast message={toast} />
    </>
  );
}
