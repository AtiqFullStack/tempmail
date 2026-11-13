# Postfix integration — review and apply manually

For the already-configured server switching from the old domain, follow [mailizator-migration.md](mailizator-migration.md); do not append a duplicate pipe service or map reference.

Nothing in this repository edits Postfix, DNS, hostnames, firewall rules, or other VPS services. Do not reinstall Postfix. The following is an additive integration for Ubuntu 24.04 / Postfix 3.8.6. Follow the [official pipe transport reference](https://www.postfix.org/pipe.8.html) and [virtual mailbox documentation](https://www.postfix.org/VIRTUAL_README.html). Run commands below only after reviewing the live configuration.

## Inspect and back up first

```sh
sudo postconf -n
sudo postconf -M
sudo postconf mydestination virtual_alias_domains virtual_alias_maps virtual_mailbox_domains virtual_mailbox_maps transport_maps relay_domains smtpd_relay_restrictions smtpd_recipient_restrictions recipient_delimiter maximal_queue_lifetime message_size_limit
sudo postconf -m
sudo ss -lntp '( sport = :25 )'
sudo cp -a /etc/postfix /etc/postfix.backup-tempmail-$(date +%Y%m%d-%H%M%S)
```

Record the backup location. Inspect all existing maps and any per-service overrides in `master.cf`. Confirm `mailizator.com` is not currently delivering another application's mail. A domain cannot simultaneously be a local destination, virtual alias domain, virtual mailbox domain, or relay domain. If already configured in one of these roles, plan a reviewed migration; do not blindly add a second role. Check aliases, wildcard maps, recipient delimiters, and restrictions that may rewrite or reject recipients before routing. Keep the existing `myhostname`, `myorigin`, `mydestination`, `mynetworks`, and all other domains intact.

## Dedicated account and environment

The deployment path used below is `/home/ubuntu/projects/tempmail`. Use a dedicated unprivileged `tempmail` OS account (never root, postfix, or an account used by other apps). It must read the release, dependencies, and `.env.local`. Store runtime MongoDB credentials in that file, mode `0640`, owner `root:tempmail`; keep application sources root-owned and non-writable by the worker account. Do not pass secrets on the command line. The worker loads `MAIL_ENV_FILE` explicitly; it does not rely on your interactive shell or PM2 environment. Node must be `/opt/tempmail-node/bin/node` version 22.12+ or 24; adjust the absolute binary path if necessary.

## Add three dedicated maps

Create `/etc/postfix/tempmail_domains`:

```text
mailizator.com OK
```

Create `/etc/postfix/tempmail_recipients` (a **regexp** map):

```text
/^[a-z0-9]([a-z0-9._+-]{0,62}[a-z0-9])?@mailizator[.]com$/ OK
```

Regexp matching is case insensitive by default. This is a pattern-based mailbox lookup; no inbox registration is required. The value `OK` is a virtual mailbox existence marker, not a filesystem path, because the transport below delivers to a pipe. Existing recipient-delimiter settings can cause fallback lookups: test addresses containing `+` and invalid suffixes against the live SMTP server, and ensure existing alias maps don't alter the temporary-domain recipient. The worker validates the final envelope address again.

Create `/etc/postfix/tempmail_transport`:

```text
mailizator.com tempmail:
```

Build only the two hash maps:

```sh
sudo postmap /etc/postfix/tempmail_domains
sudo postmap /etc/postfix/tempmail_transport
postmap -q mailizator.com hash:/etc/postfix/tempmail_domains
postmap -q test123@mailizator.com regexp:/etc/postfix/tempmail_recipients
postmap -q bad@elsewhere.example regexp:/etc/postfix/tempmail_recipients
postmap -q mailizator.com hash:/etc/postfix/tempmail_transport
```

The invalid domain lookup must return nothing. Never run `postmap` to compile the regexp file.

## Merge into main.cf

Append the new map to each existing list, preserving every existing value and its lookup order. These are the exact new entries; the three assignments below apply **only if the corresponding existing list is empty**:

```text
virtual_mailbox_domains = hash:/etc/postfix/tempmail_domains
virtual_mailbox_maps = regexp:/etc/postfix/tempmail_recipients
transport_maps = hash:/etc/postfix/tempmail_transport
```

For a nonempty list, append `, hash:/etc/postfix/tempmail_domains`, `, regexp:/etc/postfix/tempmail_recipients`, or `, hash:/etc/postfix/tempmail_transport` respectively to its current value, ensuring earlier catch-all maps do not intercept this domain. Add these new transport-specific settings:

```text
tempmail_destination_recipient_limit = 1
tempmail_destination_concurrency_limit = 2
tempmail_time_limit = 60s
```

Single-recipient deliveries ensure correct routing for Bcc and mixed recipients; Postfix creates an independent invocation per recipient. The worker also accepts repeated `--recipient=` arguments in direct tests and deduplicates each recipient independently.

The existing relay restrictions **must include** an effective `reject_unauth_destination` or `defer_unauth_destination` after narrowly defined trusted clients/authenticated users. A typical baseline is `permit_mynetworks, permit_sasl_authenticated, defer_unauth_destination`, but do not replace live policy with this example. Never add `permit` globally, widen `mynetworks`, or add arbitrary relay domains. Receiving a configured virtual mailbox domain does not require relaying to external domains.

Do not lower global `message_size_limit` on a shared server automatically. The worker permanently rejects mail above `MAX_EMAIL_SIZE_MB` (2 MiB default) and never buffers beyond this limit. A global SMTP size limit affects every hosted mail domain; only adjust it after reviewing all tenants. Use existing queue capacity limits, monitoring, and provider abuse controls for volumetric SMTP abuse.

## Append to master.cf

Add a new service, without modifying or duplicating existing services:

```text
tempmail unix - n n - 2 pipe
  flags=X user=tempmail directory=/home/ubuntu/projects/tempmail
  argv=/usr/bin/env MAIL_ENV_FILE=/etc/tempmail/worker.env /opt/tempmail-node/bin/node --import tsx /home/ubuntu/projects/tempmail/workers/receive-mail.js --sender=${sender} --recipient=${recipient}
```

Continuation lines must start with whitespace. Arguments use `--key=value` to prevent a sender or recipient beginning with a dash from becoming an option. No shell is invoked. `flags=X` marks final delivery and does not prepend recipient-dependent headers; preserve the queued bytes for stable deduplication. Do not use `F`, `D`, or `O` flags with this configuration. The null envelope sender is represented by Postfix's default pipe expansion and recorded for audit, never used as a recipient.

The worker only returns 0 after MongoDB acknowledges journaled majority writes for the message and delivery receipt. Recipient failure uses 67, oversize/malformed/too many MIME parts use 65, and database, capacity, contention, or timeout failures use 75 (`EX_TEMPFAIL`), keeping the message queued. The worker deadline is 45 seconds. A killed process is retried; leases expire in 60 seconds.

Deduplication uses SHA-256 of delivered RFC 5322 bytes plus envelope sender and recipient, rather than trusting Message-ID. Postfix adds a Received header containing the queue identifier, distinguishing independently queued deliveries. Byte-identical direct test inputs are intentionally one delivery. Receipts remain seven days after initial delivery, beyond Postfix's typical five-day queue lifetime; if your `maximal_queue_lifetime` exceeds seven days, extend receipt retention first. A replay after that window may be ingested as new. A journaled pending receipt freezes the original receive and expiry times before the message write, then is marked complete after storage. A crash between these writes is retried with that original lifetime, even if TTL has already cleaned up the message. Expired messages are never revived during the receipt window.

## Validate before reloading

```sh
sudo -u tempmail sh -c 'cd /home/ubuntu/projects/tempmail && MAIL_ENV_FILE=/etc/tempmail/worker.env /opt/tempmail-node/bin/node --import tsx workers/receive-mail.js --sender=sender@example.org --recipient=deployment-test@mailizator.com < tests/fixtures/sample.eml'
echo $?
sudo postfix check
sudo postconf -M tempmail/unix
```

Confirm that the test returns 0 and appears in `/inbox/deployment-test`. Only then schedule the manual reload:

```sh
sudo postfix reload
```

From a separate host, use `swaks --server mail.mailizator.com --port 25 --from sender@your-controlled-domain.example --to smtp-test@mailizator.com`. Check delivery, Bcc, multiple recipients, invalid recipient rejection, and other existing hosted domains. Test that `swaks --server mail.mailizator.com --from stranger@example.net --to recipient@external-domain.example --quit-after RCPT` gets **relay denied** from an untrusted external machine. Do not send this relay test through localhost or `mynetworks`.

Then send real messages from Gmail and Outlook and verify list, detail, attachments and expiry. External SMTP delivery has not been verified by the local implementation tests.

## Troubleshooting and rollback

```sh
sudo journalctl -u postfix --since '15 minutes ago'
sudo tail -n 100 /var/log/mail.log
sudo postqueue -p
sudo postcat -q QUEUE_ID
sudo postconf -n
```

`postcat` and mail logs may contain personal data; do not publish them. Missing mail often indicates DNS caching, provider TCP/25 restrictions, conflicting domain classification, an alias rewrite, unreadable environment file, Node resolution, MongoDB connectivity, or quota deferrals. A transport failure is not a reason to accept and discard mail. Inspect `df -h` and MongoDB TTL indexes when capacity deferrals persist.

To roll back, restore the reviewed `main.cf`, `master.cf` and any pre-existing maps from your backup, validate with `postfix check`, then reload. Remove only the three new map files after removing their references. Do not flush or delete the shared queue; queued temporary-domain messages require an explicit operator decision. Restoring an app release does not require restoring or deleting MongoDB data.
