# Mailizator: actual domain migration

Target website **https://mailizator.com**, receiving addresses **name@mailizator.com**, SMTP hostname **mail.mailizator.com**, existing VPS **194.238.19.154**, existing Next.js port **1117**. This is a complete switch from `email.fzeetechz.com`; simultaneous old/new receiving is not supported by the current single-domain worker.

Local code/configuration preparation is complete; live DNS, Nginx, certificates and Postfix still require the operator steps below. No remote settings are changed by this repository. Keep existing applications, OS hostname, trusted networks, relay restrictions and database credentials intact.

## 1. Hostinger DNS

Go to **Domains → mailizator.com → DNS / Nameservers → DNS records**. [Hostinger DNS instructions](https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/)

| Type | Name   | Target/value          | Priority | Suggested TTL |
| ---- | ------ | --------------------- | -------- | ------------- |
| A    | `@`    | `194.238.19.154`      | —        | 300           |
| A    | `mail` | `194.238.19.154`      | —        | 300           |
| MX   | `@`    | `mail.mailizator.com` | 10       | 300           |

If the dashboard does not allow 300, use an available TTL and allow for its cache lifetime. The root A already returned `194.238.19.154` on 2026-11-13. The SMTP A and root MX returned no answers during that check. Verify current records before editing; update existing entries instead of adding conflicting duplicates. Root `@` is intentional: addresses are `name@mailizator.com`, not `name@email.mailizator.com`.

Do not add Hostinger Email/Titan MX values: this platform receives directly on the VPS. If Hostinger Email/business mail is already active for this new root domain, migrating root MX routes all its addresses to this public service, so resolve that conflict first. Preserve unrelated TXT/CAA/NS and other-domain records. Do not reset the DNS zone. No `www` hostname is required for this chosen layout. If using a proxy/CDN later, the SMTP hostname must remain DNS-only. Do not publish AAAA unless this server's IPv6 receiving and web setup actually work.

Verify:

```bash
dig +short A mailizator.com
dig +short A mail.mailizator.com
dig +short MX mailizator.com
```

Expected: VPS IPv4 for both A lookups; `10 mail.mailizator.com.` for MX. Root MX targets a hostname, never an IP, URL or `:1117`.

## 2. Inspect and back up the existing VPS

Run these on the VPS, not the local development workstation:

```bash
cd /home/ubuntu/projects/tempmail
pm2 list
pm2 describe fzeetechz-tempmail
sudo postconf virtual_mailbox_domains virtual_mailbox_maps transport_maps
sudo postconf -xh mydestination virtual_alias_domains relay_domains
sudo postconf -M tempmail/unix
sudo postqueue -p
sudo nginx -t
sudo certbot certificates
```

The PM2 process name remains `fzeetechz-tempmail` to preserve the existing process; the product's display name is now Mailizator. `ecosystem.config.cjs` now uses the actual `/home/ubuntu/projects/tempmail` path. If PM2 shows a different actual process name, use that process name consistently. Do not start a duplicate listener on 1117.

Inspect whether `mailizator.com` is already configured as another Postfix destination or Nginx website. Do not create duplicate vhosts or duplicate domain classes. Queued messages to the old domain need a conscious delivery/drain plan before changing the worker's accepted domain; old addresses will no longer receive after retirement.

Backup as root, retaining the printed path privately:

```bash
mailizator_backup="/root/mailizator-backup-$(date +%Y%m%d-%H%M%S)"
sudo install -d -m 0700 "$mailizator_backup"
sudo cp -a /etc/postfix "$mailizator_backup/postfix"
sudo cp -a /etc/nginx "$mailizator_backup/nginx"
sudo cp -a /etc/tempmail "$mailizator_backup/worker-config"
sudo cp -a /home/ubuntu/projects/tempmail/.env "$mailizator_backup/app.env"
```

Retain the previous application release/build as well. Do not post credential backups or raw messages to chat/Git.

## 3. Deploy updated code and set application environment

Transfer/pull the updated source and `bun.lock` into `/home/ubuntu/projects/tempmail`. Deploy `lib/`, `workers/`, components and dependencies, not just the `.next` directory. The worker executes unbundled source.

Set the two domain values in the existing production `.env`, preserving its MongoDB URI and other settings. This helper edits only the two domain keys (and an existing `.env.local` override if present):

```bash
cd /home/ubuntu/projects/tempmail
python3 - <<'PY'
from pathlib import Path
for name in ('.env', '.env.local'):
    path = Path(name)
    if not path.exists():
        if name == '.env':
            raise SystemExit('Missing production .env; restore/configure it first.')
        continue
    lines = path.read_text().splitlines()
    for key in ('MAIL_DOMAIN', 'NEXT_PUBLIC_MAIL_DOMAIN'):
        matches = [i for i, line in enumerate(lines)
                   if line.lstrip().startswith(key + '=')
                   or line.lstrip().startswith('export ' + key + '=')]
        if matches:
            for i in matches:
                lines[i] = key + '=mailizator.com'
        else:
            lines.append(key + '=mailizator.com')
    path.write_text('\n'.join(lines) + '\n')
print('Mail domain values updated; database credentials preserved.')
PY
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
```

Stop if a command fails. The checked-in `.env.example` is an example, not a replacement for production credentials. `TRUST_PROXY=true` is appropriate only behind the loopback binding and Nginx configuration that overwrite `X-Real-IP`; preserve your actual deployment's trust policy.

## 4. Prepare HTTP vhost and HTTPS certificate

Do not stop Nginx: other sites are live. Check whether an existing Nginx server block already handles either new hostname. If one exists, merge the following settings into that dedicated vhost instead of installing a duplicate.

For an unused hostname, the repository supplies `docs/nginx-mailizator-http.conf`. It proxies to the existing app and serves ACME challenges:

```bash
sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge
sudo install -m 0644 docs/nginx-mailizator-http.conf /etc/nginx/sites-available/mailizator.conf
sudo ln -s /etc/nginx/sites-available/mailizator.conf /etc/nginx/sites-enabled/mailizator.conf
sudo nginx -t
```

Only if validation passes:

```bash
sudo systemctl reload nginx
```

Do not repeat the symlink command if the correct link already exists. These paths assume the existing Ubuntu layout includes `sites-enabled` inside the Nginx `http` context; check the live layout first.

After both new A records resolve correctly and HTTP port 80 is reachable, use the existing Certbot installation/ACME process. The webroot flow does not stop other websites:

```bash
sudo certbot certonly --webroot \
  -w /var/www/letsencrypt \
  --cert-name mailizator.com \
  -d mailizator.com \
  -d mail.mailizator.com
```

The template expects `/etc/letsencrypt/live/mailizator.com/fullchain.pem` and `privkey.pem`. Verify Certbot's returned paths. If Certbot is not installed, use the server's existing certificate manager or current official installation instructions rather than installing a second competing ACME stack. [Certbot instructions](https://certbot.eff.org/instructions)

Then replace only the new dedicated vhost with `docs/nginx.conf`:

```bash
sudo install -m 0644 docs/nginx.conf /etc/nginx/sites-available/mailizator.conf
sudo nginx -t
```

If valid:

```bash
sudo systemctl reload nginx
```

The final template declares one `mailizator_api` rate zone in the enclosing `http` context, has root-domain HTTPS, forwards to `127.0.0.1:1117`, and keeps HTTP ACME challenges reachable for both certificate names. Do not duplicate the rate-zone declaration in another file. Verify certificate renewal using the server's existing renewal process; for this certificate, `sudo certbot renew --cert-name mailizator.com --dry-run` is a read-only renewal rehearsal against the staging service.

A certificate covering the SMTP hostname is available from the SAN request above, but Nginx certificate installation does not change Postfix STARTTLS. Inspect existing `smtpd_tls_cert_file`/`smtpd_tls_key_file` settings before changing any global SMTP TLS policy, because other mail services share this Postfix instance.

## 5. Coordinated Postfix and worker cutover

This stage retires receiving for `email.fzeetechz.com`. Coordinate it with old queue delivery; there is no automatic forwarding or old-message recipient rewrite. Preserve other domains' entries.

Check the actual current maps. The commands below target the dedicated files created earlier for TempMail. If these files now contain other services/domains, preserve those entries instead of overwriting them.

Update the dedicated recipient map:

```bash
sudo tee /etc/postfix/tempmail_recipients > /dev/null <<'MAP'
/^[a-z0-9]([a-z0-9._+-]{0,62}[a-z0-9])?@mailizator[.]com$/ OK
MAP
```

Update the dedicated transport map:

```bash
sudo tee /etc/postfix/tempmail_transport > /dev/null <<'MAP'
mailizator.com tempmail:
MAP
sudo postmap /etc/postfix/tempmail_transport
```

Replace only the old literal domain in `virtual_mailbox_domains`, preserving other direct entries. This helper refuses unexpected hash/map-based domain configurations rather than overwriting them:

```bash
sudo python3 - <<'PY'
import re
import subprocess
value = subprocess.check_output(['postconf', '-h', 'virtual_mailbox_domains'], text=True).strip()
tokens = re.split(r'([,\s]+)', value)
if 'email.fzeetechz.com' in tokens:
    updated = ''.join('mailizator.com' if t == 'email.fzeetechz.com' else t for t in tokens)
    subprocess.run(['postconf', '-e', 'virtual_mailbox_domains = ' + updated], check=True)
elif 'mailizator.com' not in tokens:
    raise SystemExit('Unexpected domain map/list: inspect it and preserve existing domains manually.')
print('Virtual receiving domain points to mailizator.com.')
PY
```

Verify these existing map references still point at the dedicated files:

```bash
sudo postconf virtual_mailbox_domains virtual_mailbox_maps transport_maps
sudo postmap -q test123@mailizator.com regexp:/etc/postfix/tempmail_recipients
sudo postmap -q mailizator.com hash:/etc/postfix/tempmail_transport
sudo postmap -q test123@email.fzeetechz.com regexp:/etc/postfix/tempmail_recipients
```

Expected: new recipient `OK`; new transport `tempmail:`; old recipient no match. The regexp map must not be compiled with `postmap`.

Keep the existing pipe transport; inspect it:

```bash
sudo postconf -M tempmail/unix
```

Expected configuration equivalent:

```text
tempmail unix - n n - 2 pipe
  flags=X user=tempmail directory=/home/ubuntu/projects/tempmail
  argv=/usr/bin/env MAIL_ENV_FILE=/etc/tempmail/worker.env /opt/tempmail-node/bin/node --import tsx /home/ubuntu/projects/tempmail/workers/receive-mail.js --sender=${sender} --recipient=${recipient}
```

The pipe contains no hardcoded mail domain and does not need duplication. Keep the existing unprivileged account and Node binary. Refresh its environment snapshot immediately before the switch:

```bash
sudo install -o root -g tempmail -m 0640 \
  /home/ubuntu/projects/tempmail/.env \
  /etc/tempmail/worker.env
sudo postfix check
```

If successful:

```bash
sudo postfix reload
```

Do not change `myhostname`, `mydestination`, `mynetworks`, global SMTP size limits, or relay restrictions. Do not add `permit` globally or enable arbitrary relaying. TCP 25 was enabled during the previous setup; inspect `sudo ufw status verbose` instead of resetting the firewall. Port 1117 remains private to Nginx; no new public application port is needed.

## 6. Restart the existing web process and test

For the existing correctly configured process:

```bash
pm2 restart fzeetechz-tempmail
curl -i http://127.0.0.1:1117/api/health
curl -i https://mailizator.com/api/health
```

If `pm2 describe` showed a stale working directory, reconcile only this app using the corrected `ecosystem.config.cjs`; preserve other PM2 processes. Do not use `pm2 restart all`.

Test the worker under its real OS account:

```bash
sudo -u tempmail /bin/sh -c '
cd /home/ubuntu/projects/tempmail &&
MAIL_ENV_FILE=/etc/tempmail/worker.env \
/opt/tempmail-node/bin/node --import tsx workers/receive-mail.js \
--sender=sender@example.org \
--recipient=mailizator-worker-test@mailizator.com \
< tests/fixtures/styled-email.eml
'
```

Exit 0 plus a visible message at `https://mailizator.com/inbox/mailizator-worker-test` verifies persistence, safe styled HTML and service-user permissions. Envelope recipient controls delivery even though the fixture's To header differs.

Then test Postfix queue routing:

```bash
/usr/sbin/sendmail -i -f sender@example.org \
  mailizator-postfix-test@mailizator.com \
  < /home/ubuntu/projects/tempmail/tests/fixtures/sample.eml
sudo tail -n 40 /var/log/mail.log
sudo postqueue -p
```

Expect `relay=tempmail`, `status=sent`. Next send a fresh real Gmail/Outlook email to `test123@mailizator.com`, inspect live logs and `/inbox/test123`, and test safe attachment download and expiration. Repeat an ingestion fixture to verify no duplicate. Browser refresh alone cannot restore styling removed from old stored messages.

Automated checks are also available locally/CI with isolated MongoDB: `bun run test`, `bun run build`, `bun run test:http`. They do not prove external SMTP or production TLS.

## 7. Retire the old website and retain rollback

After the new website and external email delivery pass, decide whether the old website should redirect to `https://mailizator.com` or be retired. Keep its certificate valid for an HTTPS redirect. Do not delete other old-domain vhosts or unrelated records. Old email delivery does not follow an HTTP redirect; old-address sending will fail after receiving is retired.

Rollback requires the previous code/build **and matching old domain values in both app/worker env**, previous Postfix maps/main.cf, and previous Nginx config. Validate the restored services before reload. Preserve queues and database data; do not bulk-rename historical envelope recipients. The new-domain inbox API will not list old-domain recipients, although existing messages remain subject to their original expiry.

Initial DNS verification for this migration was 2026-11-13. Recheck immediately before applying. No production migration success is claimed until these live steps pass.
