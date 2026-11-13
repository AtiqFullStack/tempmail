# Existing Ubuntu VPS deployment

Target: `194.238.19.154`, web domain `mailizator.com`, SMTP hostname `mail.mailizator.com`. This repository contains configuration examples, not an installer. For the existing server cutover, start with [mailizator-migration.md](mailizator-migration.md). No live services have been changed.

## Runtime and local setup

Use Node 22.12+ (tested here with 22.22.2) or Node 24, Bun 1.3.11 for reproducible dependency installation, and MongoDB 7+ with WiredTiger journaling enabled. MongoDB is required at runtime, not for building. Keep the existing server's Node runtime unchanged for other applications; install a separate runtime/path if needed. Avoid building concurrently with other large jobs on a host with no swap.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
# Edit .env.local; do not commit it.
bun run db:indexes
bun run dev
```

Next loads `.env.local`; ingestion scripts explicitly load `MAIL_ENV_FILE` or `.env.local`. Keep `MAIL_DOMAIN` and `NEXT_PUBLIC_MAIL_DOMAIN` identical. Public variables are compiled into the client: rebuild when the domain changes. Server configuration is validated on use; never put database credentials in a `NEXT_PUBLIC_` variable. `TRUST_PROXY=false` is safe for local development but shares a single rate bucket across direct clients. Set it to `true` only with the loopback binding and Nginx proxy below.

Local ingestion into your configured MongoDB:

```sh
bun run test:ingest
curl http://localhost:1117/api/inbox/local-test
# Or directly exercise the actual stdin worker:
node --import tsx workers/receive-mail.js --sender=sender@example.org --recipient=local-test@mailizator.com < tests/fixtures/sample.eml
echo $?
```

Open `/inbox/local-test`, view HTML and download `readme.txt`. The JavaScript attachment is discarded. Repeat ingestion to confirm only one delivery. If rerunning the same expired fixture within seven days, change its Message-ID to create distinct delivered bytes; otherwise the retry receipt intentionally prevents resurrection.

## Database

Use a dedicated `tempmail` database and restricted MongoDB account. Bind MongoDB to loopback or an authenticated private network, enable authentication, and grant the application access only to this database. Do not expose 27017 publicly or alter an existing MongoDB instance's global settings without reviewing its tenants. Put the authenticated URI in `.env.local`. The deploy account must be able to create the application collections/indexes (or have an operator run `db:indexes`).

`Email` stores metadata, text, sanitized HTML, and protected attachment binary subdocuments. Attachment object IDs are storage references. Data is excluded from default selections and every public response; only the download route retrieves it. Binary data is **not** written to `public/` or a caller-selected filesystem path. A single atomic message document keeps attachment lifetime consistent with message lifetime and avoids filesystem orphan cleanup or a replica-set requirement for multi-document transactions.

Run `bun run db:indexes` before enabling traffic. Worker startup also ensures indexes. Confirm `expiresAt` TTL indexes on `emails`, `deliveryreceipts`, and `ratebuckets`; `deliveryId` is unique. All APIs additionally filter expiry so the MongoDB TTL monitor delay never exposes expired messages. Do not manually delete delivery receipts during retry windows.

## Build and process supervision

Deploy the checked-out release to `/home/ubuntu/projects/tempmail` with a dedicated `tempmail` account. Inspect the example's port 1117 and process name for collisions before enabling them. Install/build as the deployment owner, then give the runtime account read/execute access without write access to the code.

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
NODE_OPTIONS=--max-old-space-size=768 bun run build
bun run db:indexes
# Run the following as the dedicated runtime user with an existing PM2 setup:
pm2 start ecosystem.config.cjs --only fzeetechz-tempmail
pm2 save
pm2 logs fzeetechz-tempmail --lines 100
curl -i http://127.0.0.1:1117/api/health
```

The integration suite downloads a roughly 77 MB isolated MongoDB test binary on first run; run it in CI/local first to avoid that cost on the VPS. The production worker is on demand through Postfix; do not run it as a persistent PM2 stdin listener. The PM2 application is bound to loopback, has a 384 MB V8 heap and 512 MB restart threshold. Configure PM2 boot persistence for this dedicated OS user without resetting another user's existing PM2 services. Avoid `pm2 restart all`, `pm2 kill`, or global npm upgrades. Keep a previous release for rollback. A build may need more RAM than the runtime limit; preferably build on a matching Linux CI host and deploy the output plus matching dependencies. Do not copy macOS native dependencies to Linux.

## Nginx and TLS

Use [nginx.conf](nginx.conf) as a **new dedicated vhost**. The rate zone belongs inside the existing `http {}` context, outside server blocks. Issue a TLS certificate for `mailizator.com` using your existing ACME process before enabling the TLS configuration. Preserve all other vhosts. Do not modify the default server. Back up the existing configuration, run `sudo nginx -t`, then manually reload Nginx. Avoid proxy caching for inboxes/API/attachments. If using a CDN, configure Nginx real IP trust only for verified CDN ranges before trusting its derived client address; do not trust arbitrary forwarded headers.

`X-Real-IP` is overwritten at Nginx. Application rate limiting uses shared MongoDB minute buckets (120 requests/minute/client across all APIs); Nginx adds a 2 requests/second limit with burst 15. Without the trusted reverse proxy, the application deliberately shares one direct bucket instead of trusting spoofed client headers. Restrict the Next port to loopback. Security headers are supplied by Next, and HTTPS HSTS by the TLS vhost. The HTML viewer has a separate restrictive CSP and sandbox, no scripts, forms, remote images or remote styles. Safe inline colors, typography, spacing, borders, and table layout are preserved. Embedded stylesheet rules are inlined locally using Juice, then filtered through a strict CSS property/value allowlist; external stylesheets, web fonts, CSS URLs, positioning, and animation are discarded. Selector work is bounded; oversized templates fall back to inline-style sanitization. The viewer defaults to HTML when available, with plain text selectable. Allowed links open separately with no referrer/opener.

## DNS and SMTP connectivity

Read-only DNS lookup performed 2026-11-13: root A `mailizator.com` resolves to `194.238.19.154`; `mail.mailizator.com` A and root MX returned no answers. Required MX: `mailizator.com -> mail.mailizator.com` priority 10. Add the missing DNS records before external receiving. Follow [the actual cutover guide](mailizator-migration.md).

Recheck immediately before deployment:

```sh
dig +short A mailizator.com
dig +short A mail.mailizator.com
dig +short MX mailizator.com
dig +short AAAA mail.mailizator.com
```

Remove or fix an unusable AAAA record rather than publishing IPv6 without a working listener. From a separate external machine test `nc -vz mail.mailizator.com 25`; from the VPS inspect `sudo ss -lntp '( sport = :25 )'` and the existing firewall/provider security group. Inbound TCP 25 must be allowed by the VPS provider and operator-managed firewall. No firewall rules are changed by this repository. Ask the provider to confirm inbound/outbound TCP 25 policy; outbound SMTP is not needed for this receive-only application, but Postfix may generate delivery-status notifications. Do not assume a localhost TCP connection demonstrates Internet reachability.

Follow [postfix-setup.md](postfix-setup.md) for the exact additive maps and pipe transport. Complete external Gmail/Outlook tests only after DNS, network, and Postfix validation. No local test proves external SMTP delivery.

## Capacity and operations

The default `MAX_STORED_BYTES=268435456` admits at most 256 MiB of estimated message/attachment document content, using a shared database lease to serialize admissions. This counts expired documents still waiting for TTL deletion. The default 2 MiB raw-message limit, 20 MIME attachment limit, 50 direct-envelope-recipient limit, bounded text/HTML, parser options, database pool of 8, and Postfix process limit of 2 bound per-delivery work. Quota exhaustion defers delivery with 75. Never acknowledge and discard a delivery because the database is full.

This is a **logical admission quota**, not an OS disk quota: MongoDB journal, indexes, delivery receipts (seven days), rate buckets, collection allocation, Postfix queue, application builds, and logs also consume disk. MongoDB usually reuses freed space rather than returning it to the OS. A 14 GB free disk requires monitoring; use an operator-managed dedicated volume/quota if a hard filesystem ceiling is needed. Do not cap a shared MongoDB filesystem without reviewing other databases. Monitor `df -h`, `db.stats()`, message count/size, TTL progress, `postqueue -p`, memory, and log growth. Alert before free disk falls below 3 GB. Existing Postfix queue limits and inbound connection/rate controls must be reviewed for flood resistance on this shared service.

Configure bounded log rotation for only `/var/log/nginx/tempmail-*.log` and the named PM2 application's logs. Preserve system Postfix log rotation. For this dedicated app, a typical target is 10 MB/log, 3 compressed rotations; enable through your existing logging process without resetting other apps' policies. Keep backups and test MongoDB binaries off the small VPS where possible. Avoid verbose raw email logs. Do not automate a global swap change.

```sh
pm2 describe fzeetechz-tempmail
pm2 logs fzeetechz-tempmail --lines 100
sudo tail -n 100 /var/log/nginx/tempmail-error.log
sudo journalctl -u postfix --since '15 minutes ago'
sudo postqueue -p
df -h
free -m
```

Health returns only a database connection result and timestamp; it does not assert SMTP delivery health. A 503 can indicate MongoDB connectivity, invalid configuration, or resource failure. Invalid inputs return 400, missing/expired messages 404, and API throttling 429.

## Rollback

Keep previous code/build and configuration snapshots. Stop/restart only `fzeetechz-tempmail`, switch to the previous release, and restart that named process. Restore only this Nginx vhost after `nginx -t`. For Postfix, follow its separate rollback section, validate and reload; preserve queued mail and other domains. No database migration destroys data. Retention/TTL settings need explicit review if changed after initial index creation: changing the environment affects new messages, not an existing message's expiry or existing TTL index definition.

## HTML rendering updates

Sanitization runs when the worker receives a message. Previously stored messages whose styling was already removed cannot recover it: resend a fresh email after deployment. Install the updated dependencies, rebuild/restart the web app, and deploy the updated worker source; Postfix pipe invocations load the new source on their next delivery. Keep `tsx` and `juice` installed as production dependencies. No Postfix routing or firewall changes are needed for this rendering fix.

## Known boundaries

No authentication: public inbox names and IDs confer no privacy. No sending, forwarding, recovery, antivirus scanning, full-text search, or Socket.IO is implemented. Polling runs every five seconds on visible pages; storage and API service functions are separate so a future event publisher can be added after durable writes. API pagination uses bounded offset pages. Denied attachment types are discarded, not downloadable. Local deduplication receipts are retained seven days. Real external mail and production TLS/Postfix changes remain operator validation steps.
