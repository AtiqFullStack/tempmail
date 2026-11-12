"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Download,
  FileText,
  Inbox,
  LoaderCircle,
  Mail as MailIcon,
  Paperclip,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { Header, Footer, Toast, copyAddress } from "./shell";
import { domain } from "./address-form";
import type { Mail, InboxResponse } from "@/types/mail";
import { emailDocument } from "@/lib/email-document";
async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not load inbox. Please retry.");
  return data;
}
function shortSender(from: string) {
  return (
    from
      .replace(/<[^>]*>/g, "")
      .replace(/"/g, "")
      .trim() || from
  );
}
function expiry(value: string, now: number) {
  const seconds = Math.max(
    0,
    Math.ceil((new Date(value).getTime() - now) / 1000),
  );
  return seconds ? `${Math.ceil(seconds / 60)} min left` : "Expired";
}
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function InboxClient({ username }: { username: string }) {
  const [data, setData] = useState<InboxResponse>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<Mail>();
  const [detailError, setDetailError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [format, setFormat] = useState<"text" | "html">("text");
  const [read, setRead] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const refreshController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastError = useRef("");
  const address = `${username}@${domain}`;
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  const refresh = useCallback(async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshing(true);
    try {
      const result = await request<InboxResponse>(
        `/api/inbox/${encodeURIComponent(username)}?page=${page}`,
        controller.signal,
      );
      setData(result);
      setError("");
      lastError.current = "";
    } catch (e) {
      if (!controller.signal.aborted) {
        const message = (e as Error).message;
        setError(message);
        if (lastError.current !== message) notify(message);
        lastError.current = message;
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [username, page, notify]);
  useEffect(() => {
    const initial = setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem(`tempmail-read:${username}`) || "[]",
        );
        setRead(
          Array.isArray(stored)
            ? stored
                .filter((id): id is string => typeof id === "string")
                .slice(-500)
            : [],
        );
      } catch {
        setRead([]);
      }
      void refresh();
    }, 0);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    function visible() {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void refresh();
      }
    }
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      refreshController.current?.abort();
      detailController.current?.abort();
      document.removeEventListener("visibilitychange", visible);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh, username]);
  async function openMessage(id: string) {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelected(id);
    setDetail(undefined);
    setDetailError("");
    setDetailBusy(true);
    setFormat("text");
    try {
      const message = await request<Mail>(
        `/api/emails/${id}`,
        controller.signal,
      );
      setDetail(message);
      setFormat(message.sanitizedHtml ? "html" : "text");
      setRead((previous) => {
        const next = [...new Set([...previous, id])].slice(-500);
        try {
          localStorage.setItem(
            `tempmail-read:${username}`,
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        setDetailError((e as Error).message);
        notify((e as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) setDetailBusy(false);
    }
  }
  const messages =
    data?.messages.filter((m) => new Date(m.expiresAt).getTime() > now) || [];
  const expired = detail && new Date(detail.expiresAt).getTime() <= now;
  return (
    <>
      <Header />
      <main className="container inbox-page">
        <Link href="/" className="back-link">
          <ArrowLeft size={15} /> Back to a fresh start
        </Link>
        <div className="inbox-heading">
          <div>
            <span className="small-label section-kicker">
              YOUR LITTLE CORNER OF THE INTERNET
            </span>
            <h1>
              Your temporary inbox<span>.</span>
            </h1>
            <p>Here for what you need. Gone when you don&apos;t.</p>
          </div>
          <span className="poll-badge">
            <span className="live-dot" /> Updates every 5 seconds
          </span>
        </div>
        <section className="inbox-address">
          <span className="inbox-address-icon">
            <MailIcon size={24} />
          </span>
          <div>
            <span className="small-label">RECEIVING EMAIL AT</span>
            <strong>{address}</strong>
          </div>
          <button
            className="button secondary"
            onClick={() => copyAddress(address, notify)}
          >
            <Copy size={16} />
            <span>Copy address</span>
          </button>
        </section>
        <div className="inbox-warning">
          <TriangleAlert size={17} />
          <p>
            <strong>This is a public inbox.</strong> Anyone with this address
            can read its messages. Keep sensitive information in your personal
            inbox.
          </p>
        </div>
        <section
          className={`mail-workspace ${selected ? "has-selection" : ""}`}
        >
          <div className="mail-list-panel">
            <div className="mail-panel-header">
              <h2>
                <Inbox size={19} /> Inbox{" "}
                <span className="count">{data?.total ?? "—"}</span>
              </h2>
              <button
                className="icon-button"
                aria-label="Refresh inbox"
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                <RefreshCw size={17} className={refreshing ? "spin" : ""} />
              </button>
            </div>
            {loading ? (
              <div className="skeletons" aria-label="Loading messages">
                {[1, 2, 3].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
            ) : error ? (
              <div className="panel-state error-state">
                <TriangleAlert size={30} />
                <h3>Couldn&apos;t reach your inbox</h3>
                <p role="alert">{error}</p>
                <button
                  className="button secondary"
                  onClick={() => void refresh()}
                >
                  Try again <RefreshCw size={15} />
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="panel-state">
                <div className="empty-icon">
                  <Inbox size={34} strokeWidth={1.3} />
                </div>
                <h3>A little breathing room.</h3>
                <p>
                  {page > 1
                    ? "No messages on this page. Try the previous page."
                    : "Your inbox is waiting for its first email. Share your address and new messages will appear here."}
                </p>
                <span className="waiting-label">
                  <span className="live-dot" /> Waiting for incoming mail
                </span>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <button
                    className={`message-row ${selected === message._id ? "selected" : ""} ${read.includes(message._id) ? "read" : "unread"}`}
                    key={message._id}
                    onClick={() => void openMessage(message._id)}
                  >
                    <div className="message-row-top">
                      <strong>{shortSender(message.from)}</strong>
                      <time>{date(message.receivedAt)}</time>
                    </div>
                    <div className="message-subject">
                      {!read.includes(message._id) && (
                        <span className="unread-dot" />
                      )}
                      {message.subject}
                      {message.attachments.length > 0 && (
                        <Paperclip size={13} />
                      )}
                    </div>
                    <p>{message.preview || "No text preview"}</p>
                    <span className="expiry">
                      <Clock3 size={11} />
                      {expiry(message.expiresAt, now)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ArrowLeft size={15} />
              </button>
              <span>Page {page}</span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={!data?.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
          <div className="mail-detail-panel">
            {!selected ? (
              <div className="detail-placeholder">
                <div className="detail-envelope">
                  <MailIcon size={53} strokeWidth={1} />
                  <span>
                    <Check size={12} />
                  </span>
                </div>
                <h3>A message, a moment.</h3>
                <p>Select an email to see what&apos;s inside.</p>
                <span className="detail-footer">
                  <Clock3 size={13} /> Every message has its own expiration time
                </span>
              </div>
            ) : (
              <>
                <div className="detail-toolbar">
                  <button
                    className="text-link close-detail"
                    onClick={() => {
                      detailController.current?.abort();
                      setSelected(undefined);
                      setDetail(undefined);
                    }}
                  >
                    <ArrowLeft size={15} />
                    <span>All messages</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Close message"
                    onClick={() => {
                      detailController.current?.abort();
                      setSelected(undefined);
                      setDetail(undefined);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                {detailBusy ? (
                  <div className="panel-state">
                    <LoaderCircle className="spin" size={25} />
                    <p>Opening your message…</p>
                  </div>
                ) : detailError ? (
                  <div className="panel-state">
                    <TriangleAlert size={30} />
                    <p role="alert">{detailError}</p>
                    <button
                      className="button secondary"
                      onClick={() => void openMessage(selected)}
                    >
                      Try again
                    </button>
                  </div>
                ) : expired ? (
                  <div className="panel-state">
                    <Clock3 size={32} />
                    <h3>This message has expired.</h3>
                    <p>Expired messages are no longer available.</p>
                  </div>
                ) : detail ? (
                  <article className="email-detail">
                    <div className="email-meta">
                      <span className="expiry">
                        <Clock3 size={12} />
                        {expiry(detail.expiresAt, now)}
                      </span>
                      <h2>{detail.subject}</h2>
                      <p>
                        <strong>From</strong> {detail.from}
                      </p>
                      <p>
                        <strong>Delivered to</strong> {detail.envelopeRecipient}
                      </p>
                      {detail.to && (
                        <p>
                          <strong>To header</strong> {detail.to}
                        </p>
                      )}
                      {detail.cc && (
                        <p>
                          <strong>Cc</strong> {detail.cc}
                        </p>
                      )}
                      <time>{date(detail.receivedAt)}</time>
                    </div>
                    <div className="view-toggle">
                      <button
                        className={format === "text" ? "active" : ""}
                        onClick={() => setFormat("text")}
                      >
                        <FileText size={14} /> Plain text
                      </button>
                      <button
                        disabled={!detail.sanitizedHtml}
                        className={format === "html" ? "active" : ""}
                        onClick={() => setFormat("html")}
                      >
                        HTML
                      </button>
                      <span>Remote content blocked</span>
                    </div>
                    {format === "text" ? (
                      <pre className="email-text">
                        {detail.text ||
                          "This email has no plain-text body. Switch to HTML to read it."}
                      </pre>
                    ) : (
                      <iframe
                        className="email-frame"
                        title="Sanitized email content"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        referrerPolicy="no-referrer"
                        srcDoc={emailDocument(detail.sanitizedHtml || "")}
                      />
                    )}{" "}
                    {!!detail.attachments.length && (
                      <div className="attachments">
                        <h3>
                          <Paperclip size={15} />
                          Attachments · {detail.attachments.length}
                        </h3>
                        <p>
                          Only open files you trust. Downloads are not
                          virus-scanned.
                        </p>
                        {detail.attachments.map((file) => (
                          <a
                            key={file._id}
                            href={`/api/emails/${detail._id}/attachments/${file._id}`}
                            download
                            className="attachment"
                          >
                            <FileText size={20} />
                            <span>
                              <strong>{file.filename}</strong>
                              <small>
                                {Math.ceil(file.size / 1024)} KB ·{" "}
                                {file.contentType}
                              </small>
                            </span>
                            <Download size={17} />
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                ) : null}
              </>
            )}
          </div>
        </section>
        <p className="inbox-bottom-note">
          <LeafIcon /> A temporary home for your just-this-once emails. No
          sending or replies.
        </p>
      </main>
      <Footer />
      <Toast message={toast} />
    </>
  );
}
function LeafIcon() {
  return <Check size={14} />;
}
