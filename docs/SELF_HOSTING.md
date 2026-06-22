# Self-Hosting Sublemonable

Run your own relay. The server is intentionally small: Go binary + PostgreSQL, nothing else.

## Requirements

- A VPS with 1 vCPU / 1 GB RAM is plenty for hundreds of users (Hetzner, Vultr, fly.io all work)
- Docker + Docker Compose v2
- A domain with DNS pointed at the box
- TLS certificate (Let's Encrypt via your reverse proxy, or bring your own)

## Docker Compose quickstart

```bash
git clone https://github.com/jackofall1232/sublemonable.git
cd sublemonable
cp server/.env.example .env            # edit values — see reference below

# Generate JWT signing keys (mounted into the container)
mkdir -p server/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out server/keys/jwt.pem
openssl rsa -in server/keys/jwt.pem -pubout -out server/keys/jwt.pub.pem

docker compose up -d
```

The server listens on `SERVER_PORT` (default 8443). Migrations run automatically on boot.

## Environment variables reference

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** PostgreSQL 16 DSN |
| `JWT_PRIVATE_KEY_PATH` | — | **Required.** RS256 PEM, keep readable by the server user only |
| `JWT_PUBLIC_KEY_PATH` | — | **Required.** |
| `SERVER_PORT` | `8443` | |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | empty | Leave empty when terminating TLS at a reverse proxy |
| `MAX_PREKEYS_PER_USER` | `100` | |
| `MESSAGE_TTL_UNDELIVERED_HOURS` | `72` | Undelivered envelopes are purged after this |
| `RATE_LIMIT_ENABLED` | `true` | Don't disable on a public instance |
| `TOR_ENABLED` | `false` | See Tor section |

## TLS setup

Two options:

1. **Reverse proxy (recommended):** terminate TLS 1.3 at Caddy/nginx and proxy to the server over
   localhost. Keep WebSocket upgrade headers (`Upgrade`, `Connection`) intact for `/ws`.
2. **Direct:** set `TLS_CERT_PATH`/`TLS_KEY_PATH` and expose the port directly.

Either way, clients require TLS 1.3 and ship with certificate pinning — when you self-host, build
the clients with **your** certificate's SPKI hash (see [Certificate pinning](#certificate-pinning)).

### Caddy reverse proxy (recommended)

Caddy gets you automatic Let's Encrypt TLS and transparent WebSocket proxying. Point your
domain's DNS at the box, open ports 80 + 443, and use this `Caddyfile`:

```caddy
relay.example.com {
    # Reuse the leaf private key across renewals so the pinned SPKI hash never
    # changes — clients can pin one durable value (see Certificate pinning).
    tls {
        reuse_private_keys
    }
    # Caddy v2 proxies the /ws WebSocket upgrade transparently; no extra config.
    reverse_proxy localhost:8443
}
```

Leave `TLS_CERT_PATH`/`TLS_KEY_PATH` empty in `.env` — the Go server then runs plain HTTP on
`8443` behind Caddy, which terminates TLS. Verify with `curl -I https://relay.example.com/api/v1/register`
(expect a response, not a connection error) and confirm a real cert: `curl` should succeed
without `-k`.

> **Use a strong `POSTGRES_PASSWORD`.** `docker-compose.yml` defaults it to `sub`; set it in `.env`.

## Certificate pinning

The clients validate the normal CA chain **and** pin your server's leaf SubjectPublicKeyInfo
(SPKI) hash, so a mis-issued or MITM certificate is rejected even if it chains to a trusted CA.
When you self-host you must put **your** pin into the clients before building them.

### Compute your pin

```bash
openssl s_client -connect relay.example.com:443 -servername relay.example.com < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | base64
# -> use as  sha256/<that base64>
```

Generate a second, **offline** backup key pair and pin it too — pinning with no backup means
losing the key bricks every client until you ship an app update:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out backup-pin-key.pem   # keep OFFLINE
openssl pkey -in backup-pin-key.pem -pubout -outform DER \
  | openssl dgst -sha256 -binary | base64
```

### Where the pins live

Set the **same** primary + backup pins (and your host) in every client:

| Client | File | What to set |
| --- | --- | --- |
| iOS | `apps/ios/Sources/Networking/PinnedSessionDelegate.swift` | `pinnedSPKISHA256` set; `APIClient.defaultBaseURL` + `WebSocketClient.defaultURL` |
| Android | `apps/android/.../net/CertificatePinning.kt` | `API_HOST`, `PRIMARY_PIN`, `BACKUP_PIN`; URLs in `SublemonableApp.kt` |
| Desktop | `apps/desktop/src-tauri/src/pinning.rs` | `API_HOST`, `PRIMARY_PIN`, `BACKUP_PIN` |

The pin host **must** match the URL the client connects to, or the pin won't apply.

### Desktop (Tauri) pinned transport

The desktop UI is the `apps/web` bundle in a WebView, which can't pin TLS itself. The native
Tauri layer (`apps/desktop/src-tauri/src/transport.rs`) therefore routes all REST and WebSocket
traffic through a rustls client that enforces the pins in `pinning.rs`; `apps/web` automatically
uses it when running under Tauri (and plain `fetch`/`WebSocket` in the browser). Build the desktop
bundle with the server URL baked in so it targets your pinned host:

```bash
VITE_SERVER_URL=https://relay.example.com pnpm --filter @sublemonable/web build
cd apps/desktop && pnpm tauri build
```

Validate the native transport before trusting it:

```bash
cd apps/desktop/src-tauri && cargo test transport   # pin/verifier unit tests
```

The verifier is **fail-closed**: a connection is accepted only when the CA chain validates AND the
leaf SPKI matches a configured pin.

### Rotating keys / pins without locking users out

SPKI pinning is "reject anything not pinned", so order matters:

1. Clients already trust **primary + backup** pins (do this from day one).
2. To rotate: point the server at your offline backup key (the one whose pin clients already
   trust). With Caddy that means installing the new key; clients keep connecting because the
   backup pin still matches.
3. Generate a fresh backup key, add its pin alongside the now-active one, and **ship a client
   update**. Only after that update is widely adopted, drop the retired pin.

Never remove a pin that the currently-served certificate depends on, and never ship a build with
a single pin and no backup.

## Optional Tor hidden service

The Tor overlay runs a hidden service that forwards onion port 80 to the server
and, in addition to the API, serves a **static no-JS mirror** (download page,
checksums, the Android APK) at the root of the `.onion`.

```bash
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d
docker compose exec tor cat /var/lib/tor/sublemonable/hostname   # your .onion address
```

Then set both in `.env` and restart the server so it picks them up:

```bash
TOR_ENABLED=true
ONION_ADDRESS=<the hostname you just read>     # e.g. abcd...xyz.onion
```

```bash
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d server
```

`TOR_ENABLED=true` makes the server advertise the onion address to clients;
`ONION_ADDRESS` is also what gates the mirror (see below).

### Clearnet + Tor coexist (hybrid)

The clearnet `8443` port stays published, so a hybrid box keeps serving the API
on clearnet (behind your reverse proxy) **and** over Tor. The static mirror,
however, is **Host-gated**: the server serves it only when the request `Host` is
your `ONION_ADDRESS`. This is why `ONION_ADDRESS` must be set — with it empty the
mirror fails closed and is never served.

| Request reaches the server as… | API | Static APK mirror |
| --- | --- | --- |
| `Host: <your>.onion` (via the hidden service) | ✅ served | ✅ served |
| `Host: relay.example.com` / IP (clearnet) | ✅ served | ❌ 404 — not mounted |

So ordinary clearnet visitors, search engines and IP scanners never see the
mirror; only traffic arriving through the hidden service does.

### Stage the APK before enabling the mirror

The Android APK and `aab`/keystore artifacts are **never committed to the
repository** (they are `.gitignore`d). The mirror serves whatever you stage into
the `onion-site/` directory, which is mounted read-only into the server. Before
(or after) bringing the hidden service up, stage the release build and a matching
checksum file:

```bash
# Copy the release APK you want to distribute into the mirror directory
cp sublemonable-v1.0.0-beta.apk onion-site/

# Generate a checksum list the mirror serves at /SHA256SUMS
sha256sum onion-site/*.apk > onion-site/SHA256SUMS
```

The download page reacts to what is present:

- **APK staged** → the page shows the download button and `sha256sum`
  verification steps, and `/<file>.apk` is served over Tor.
- **No APK staged** → the page **hides the download link** and shows operator
  guidance (where to get the release, how to stage it) instead of dead-linking to
  a 404. This is the expected state on a fresh clone.

Future APK releases are published separately — re-run the two commands above with
the new build to update the mirror; no rebuild of the server is required (the
directory is bind-mounted).

## Updating

```bash
git pull
docker compose pull
docker compose up -d --build
```

Migrations are forward-only and applied on boot. Read the release notes before major version jumps.

## Backup and recovery

There is intentionally little to back up — delivered messages are already gone. Back up:

- The PostgreSQL volume (public keys + undelivered envelopes):
  `docker compose exec postgres pg_dump -U sub sublemonable > backup.sql`
- Your JWT signing keys (`server/keys/`) — losing them logs every client out
- Your Tor hidden service keys (`tor-data` volume) — losing them changes your .onion address
- Your offline certificate backup key (`backup-pin-key.pem`) — store it **off the server**; it is
  the only way to rotate to a pin clients already trust without shipping an app update first

Do **not** back up to anywhere that weakens your users' threat model; the database contains
undelivered (encrypted) envelopes.
