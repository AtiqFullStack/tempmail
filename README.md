# TempMail

A receive-only public temporary email platform for `email.fzeetechz.com`, built with Next.js App Router, React 19, Tailwind, Mongoose, mailparser and a separate Postfix stdin worker.

The responsive homepage generates/customizes inbox addresses. `/inbox/[username]` polls every five seconds while visible, tracks read status locally, shows actual per-message expiry, and supports plain text, sandboxed sanitized HTML and allowed attachment downloads. All inboxes are public. No login, sending or forwarding exists.

## Run locally

Requires Node 22.12+ or 24, Bun 1.3.11 and MongoDB 7+.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
# Configure MongoDB and keep both mail domain values identical.
bun run db:indexes
bun run dev
```

In another terminal, `bun run test:ingest` stores the real sample `.eml` in MongoDB. Visit `http://localhost:1117/inbox/local-test`. Postfix is not required for this local test.

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:http
```

Tests launch a real isolated MongoDB with `mongodb-memory-server` (first run downloads a test binary). They exercise validation, Unicode/MIME parsing, sanitization, persistent multi-recipient ingestion, idempotency, API projection/pagination, expired message filtering, safe attachment downloads, shared rate limiting, storage quota and actual worker subprocess exit codes. They do not assert external SMTP delivery.

## API

| Method and path                                      | Behavior                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/inbox/:username?page=1&limit=20&sort=desc` | Live messages, total and bounded pagination; `asc` also supported |
| `GET /api/emails/:id`                                | Live message detail and attachment metadata                       |
| `GET /api/emails/:id/attachments/:attachmentId`      | Forced binary download for an allowed live attachment             |
| `GET /api/health`                                    | Database ping with no credentials or internal paths               |

Messages expire after one hour by default. MongoDB TTL removes messages and their embedded attachment bytes together. APIs filter expiry independently of TTL cleanup. Attachments live inside protected MongoDB documents, never a public directory. A shared MongoDB quota lock and journaled writes prevent acknowledgement before persistence. Seven-day delivery receipts prevent retry resurrection after message expiry.

Configure and operate this on your existing VPS using [the deployment guide](docs/deployment.md), [manual Postfix integration](docs/postfix-setup.md), [Nginx example](docs/nginx.conf), [PM2 configuration](ecosystem.config.cjs), and [.env.example](.env.example).

Nothing automatically modifies the VPS, DNS, firewall, Postfix or other applications. External SMTP must be tested after deployment. DNS inspection on 2026-11-12 found the MX points at `email.fzeetechz.com`; the requested target is `mail.email.fzeetechz.com` (both A records currently point at `194.238.19.154`).
