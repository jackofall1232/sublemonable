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
mobile clients with **your** certificate's SPKI hash.

## Optional Tor hidden service

```bash
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d
docker compose exec tor cat /var/lib/tor/sublemonable/hostname   # your .onion address
```

Set `TOR_ENABLED=true` so the server advertises the onion address to clients.

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

Do **not** back up to anywhere that weakens your users' threat model; the database contains
undelivered (encrypted) envelopes.
