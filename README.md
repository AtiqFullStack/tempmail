# Mailizator

A receive-only public temporary email platform for `mailizator.com`, built with Next.js App Router, React 19, Tailwind, Mongoose, mailparser and a separate Postfix stdin worker.

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

Current target: **https://mailizator.com**, receiving addresses **name@mailizator.com**, SMTP host **mail.mailizator.com**, on the existing VPS and port **1117**. Follow [the exact Hostinger/VPS migration guide](docs/mailizator-migration.md). Code preparation does not change live DNS, Nginx, or Postfix. On 2026-11-13 the root A record resolved to `194.238.19.154`; the SMTP host A and root MX still needed configuration. Retest external delivery after cutover.

Complete Hinglish walkthrough: [setup, packages, DNS, server configuration, testing and maintenance](docs/complete-guide-hi.md).

## Complete domain change guide — Hinglish

Maan lo poora setup aise change karna hai:

| Cheez            | Purana                      | Naya example              |
| ---------------- | --------------------------- | ------------------------- |
| Website          | `email.fzeetechz.com`       | `email.example.com`       |
| Email address    | `owner@email.fzeetechz.com` | `owner@email.example.com` |
| SMTP hostname    | `mail.email.fzeetechz.com`  | `mail.email.example.com`  |
| VPS IP           | `194.238.19.154`            | Same                      |
| Application port | `1117`                      | Same                      |

`example.com` samjhane ke liye example hai. Actual migration mein apna naya domain use karna. Ye guide change ka impact samjhati hai; existing live settings inspect aur backup karke hi configuration apply karo.

**Domain change mein paanch jagahon ka connection update hota hai: DNS, Nginx/SSL, application environment, worker environment aur Postfix.**

### 1. Pehle har component ki responsibility samjho

| Component         | Uski responsibility                                         |
| ----------------- | ----------------------------------------------------------- |
| DNS               | Domain kis server par pahunchna chahiye                     |
| Nginx             | Website request kis application ko deni hai                 |
| HTTPS certificate | Browser ko naye website hostname ki identity verify karwana |
| Next.js           | Website, inbox UI aur APIs chalana                          |
| Postfix           | Internet se email accept karna                              |
| Mail worker       | Email parse, validate aur store karna                       |
| MongoDB           | Messages aur attachments rakhna                             |
| PM2               | Next.js process ko running rakhna                           |

**Website ka flow:**

Browser → DNS A record → Nginx 443 → Next.js 1117 → MongoDB

**Email ka flow:**

Sender → DNS MX record → Postfix 25 → Worker → MongoDB

Isi wajah se website chal sakti hai jabki incoming email broken ho—dono flows ke components alag hain.

### 2. DNS mein kya change hoga aur kyun

Naye example domain ke liye:

| Record | Full hostname            | Target                                  |
| ------ | ------------------------ | --------------------------------------- |
| A      | `email.example.com`      | `194.238.19.154`                        |
| A      | `mail.email.example.com` | `194.238.19.154`                        |
| MX     | `email.example.com`      | `mail.email.example.com`, priority `10` |

**A record** bolta hai: “Is hostname ka server is IP par hai.”

**MX record** bolta hai: “Is email domain ki mail is SMTP hostname ko deliver karo.”

Jab Gmail `owner@email.example.com` ko message bhejega, woh `email.example.com` ka MX dekhega, phir SMTP hostname ke IP par port 25 connect karega.

DNS mein `1117` nahi dalte. DNS IP/hostname resolve karta hai; application port Nginx handle karta hai.

Agar DNS zone `example.com` hai, dashboard mein names aam taur par `email` aur `mail.email` honge. Root domain ke existing business-email MX ko replace nahi karna.

Cloudflare use ho to SMTP hostname **DNS only** hona chahiye. [Cloudflare documentation](https://developers.cloudflare.com/dns/troubleshooting/email-issues/)

### 3. Nginx mein website hostname change hoga

Nginx ek hi VPS par multiple websites handle kar sakta hai. Woh request ka hostname dekhkar correct website select karta hai.

Naye website configuration mein:

```nginx
server_name email.example.com;
```

Application same server aur same port par hai, isliye upstream same rahega:

```nginx
proxy_pass http://127.0.0.1:1117;
```

**Ye Nginx configuration entries hain, terminal commands nahi.** Inhe existing vhost ke appropriate blocks mein set karna hai.

Iska meaning: `email.example.com` par aane wali website requests TempMail application ko do.

### 4. Naye website hostname ka HTTPS certificate chahiye

Purana certificate agar sirf `email.fzeetechz.com` cover karta hai, woh naye `email.example.com` ke liye valid nahi hoga.

Isliye:

1. Naya DNS hostname resolve hona chahiye.
2. Naye hostname ka certificate issue karna hoga.
3. Nginx mein us certificate ka path configure hoga.
4. Configuration validate karke reload karna hoga.

Validation command:

```bash
sudo nginx -t
```

Successful hone par:

```bash
sudo systemctl reload nginx
```

Postfix ka SMTP STARTTLS certificate separate setting hai. Website certificate lagane se SMTP TLS automatically update nahi hota; existing Postfix TLS configuration bhi review karni hogi.

### 5. Application ko naya email domain batana hoga

Project ki `.env` mein:

```dotenv
MAIL_DOMAIN=email.example.com
NEXT_PUBLIC_MAIL_DOMAIN=email.example.com
```

Dono ka role alag hai:

- `MAIL_DOMAIN`: backend aur worker kis domain ke recipients accept karein.
- `NEXT_PUBLIC_MAIL_DOMAIN`: frontend email address mein kya display kare.

Agar frontend new domain dikhaye aur worker old domain accept kare, user ko galat address mil jayega aur receiving fail hogi.

Dono same rakhne ki validation project mein implemented hai.

`NEXT_PUBLIC_` value browser bundle mein build-time par include hoti hai. Isliye sirf `.env` edit karke browser refresh karna enough nahi—**rebuild chahiye**.

### 6. Worker environment bhi update karna hoga

Tumhare setup mein application configuration aur worker configuration do files mein hain:

| Process        | Environment file                      |
| -------------- | ------------------------------------- |
| Next.js        | `/home/ubuntu/projects/tempmail/.env` |
| Postfix worker | `/etc/tempmail/worker.env`            |

Worker copy alag rakhi thi taaki Postfix ka unprivileged `tempmail` account explicitly correct configuration load kare.

Application `.env` update karne ke baad:

```bash
sudo install -o root -g tempmail -m 0640 \
  /home/ubuntu/projects/tempmail/.env \
  /etc/tempmail/worker.env
```

Agar ye step miss hua, website naye domain par ho sakti hai lekin worker abhi bhi purana domain validate karega.

### 7. Postfix ko naya domain receive karna sikhana hoga

Postfix ko teen answers chahiye:

1. Kya main is domain ki mail accept karun?
2. Kaunse recipient names valid hain?
3. Accepted message kis delivery service ko doon?

Tumhare project mein inke answers hain:

| Setting/file                       | Answer                             |
| ---------------------------------- | ---------------------------------- |
| `virtual_mailbox_domains`          | Naya email domain receive karo     |
| `/etc/postfix/tempmail_recipients` | Valid username pattern accept karo |
| `/etc/postfix/tempmail_transport`  | Message `tempmail` worker ko do    |

Example domain ke liye configuration values:

**Receiving domain — `main.cf`:**

```text
virtual_mailbox_domains = email.example.com
```

**Recipient map — `/etc/postfix/tempmail_recipients`:**

```text
/^[a-z0-9]([a-z0-9._+-]{0,62}[a-z0-9])?@email[.]example[.]com$/ OK
```

**Transport map — `/etc/postfix/tempmail_transport`:**

```text
email.example.com tempmail:
```

Recipient regex valid inbox names accept karti hai. Har address ke liye mailbox ya Linux user create nahi karna padta.

Ye entries actual files mein edit hongi. Doosre domains ki existing entries preserve karni hain. Naya domain kisi conflicting local/alias/relay domain classification mein already configured na ho; inspect before cutover.

Transport hash map change ke baad:

```bash
sudo postmap /etc/postfix/tempmail_transport
sudo postfix check
```

Checks successful hone par:

```bash
sudo postfix reload
```

Dedicated pipe service same worker path use kar sakti hai. Us command mein domain hardcoded nahi—Postfix actual envelope recipient worker ko deta hai.

### 8. Application rebuild aur restart hogi

Updated environment aur code ke saath, configured PM2 process name confirm karke:

```bash
cd /home/ubuntu/projects/tempmail
bun run build && pm2 restart fzeetechz-tempmail
```

- **Build** naya frontend bundle banati hai.
- **PM2 restart** running web application ko updated build/configuration ke saath start karta hai.
- **Postfix reload** mail-server configuration apply karta hai.

Ye teen alag operations hain.

Worker permanent PM2 process nahi hai. Postfix har delivery par usko invoke karta hai, isliye next invocation updated worker environment read karegi.

### 9. Purane domain ka kya hoga

Tum completely naye domain par switch karna chahte ho. Iska matlab:

- Naye users ko naya address milega.
- Naye domain ki email accept hogi.
- Purane address par bheji mail automatically naye address par forward nahi hogi.
- Purane database messages ke recipient addresses automatically rename nahi honge.

**MX change email address rewrite nahi karta.** `owner@old-domain` aur `owner@new-domain` do alag recipients hain.

Current application ek mail domain support karti hai. Isliye old/new receiving ke beech coordinated cutover chahiye. Agar future mein dono domains simultaneously chalane hon, code mein multiple-domain support add karna hoga.

Purani queued deliveries bhi inspect karni hongi; worker ka accepted domain switch karne ke baad old-domain retries reject ho sakti hain.

### 10. Domain change par kya same reh sakta hai

Agar VPS aur project same hain:

| Item                         | Domain change ki wajah se badalna required? |
| ---------------------------- | ------------------------------------------- |
| VPS IP                       | Nahi                                        |
| Port 1117                    | Nahi                                        |
| MongoDB database/credentials | Nahi                                        |
| Message model/indexes        | Nahi                                        |
| Node/Bun/packages            | Nahi                                        |
| Worker OS account            | Nahi                                        |
| Worker executable path       | Nahi                                        |
| SMTP port 25                 | Nahi                                        |
| VPS hostname                 | Nahi                                        |

Isliye domain change ke liye project dobara banwana, Postfix reinstall karna ya server reset karna zaroori nahi.

### 11. Practical cutover ka correct order

1. Existing configuration aur release ka backup.
2. Naye DNS records prepare.
3. Naye website hostname ka HTTPS prepare.
4. Nginx ka new vhost prepare aur validate.
5. Application aur worker environment changes prepare.
6. Postfix ki new-domain mappings prepare.
7. Planned cutover mein coordinated configuration apply.
8. Application rebuild/restart aur validated service reload.
9. New-domain health, local mail aur external mail tests.
10. Purane domain ka retirement/redirect aur queued deliveries handle karo.

Single-domain implementation ke saath bina additional migration support ke zero-downtime dual-domain receiving assume nahi karni.

### 12. Kaise prove karoge ki migration successful hai

| Test                         | Kya prove karta hai                                   |
| ---------------------------- | ----------------------------------------------------- |
| Naya website HTTPS par opens | Web DNS, TLS, Nginx aur application                   |
| `/api/health` successful     | Application ka MongoDB connection                     |
| Direct worker test           | New-domain validation aur persistence                 |
| Local Postfix delivery       | Domain maps aur pipe transport                        |
| Gmail/Outlook se fresh email | Public DNS, SMTP connectivity aur full receiving flow |
| HTML/attachment test         | Message processing aur viewer                         |
| Expiry test                  | Retention behavior                                    |

Developer ko tum ye clear instruction de sakte ho:

> Website aur receiving email domain completely migrate karna hai. New DNS A/MX, HTTPS/Nginx, application aur worker environment, Postfix receiving maps aur frontend build align karo. Existing VPS, database, port aur doosri applications preserve karo. Old-domain queued mail ka plan banao aur fresh external email se end-to-end migration verify karo.

Ye understanding hone par tum har issue ko identify kar sakte ho: **domain resolution DNS ka kaam hai, website routing Nginx ka, email receiving Postfix ka, processing worker ki aur storage MongoDB ki.**
