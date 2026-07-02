<!--
  Sublemonable — Copyright (C) 2026 Sublemonable contributors
  Licensed under the GNU Affero General Public License v3.0 or later.
  SPDX-License-Identifier: AGPL-3.0-only
-->

# Tor architecture

## 1. Overview

Sublemonable runs **three separate Tor v3 hidden services on the same physical
server**. Each has a distinct `.onion` address and a distinct purpose, but they
share a single Go binary and a single internal port (`8443`). The server tells
them apart by the request `Host` header — the v3 `.onion` address the client
dialed arrives as the HTTP `Host`, and `registerOnionMirror`
(`server/cmd/server/onion.go`) routes on it.

This is deliberately simple: one box, one process, three identities. The cost is
that all three services share the server's fate and location; the benefit is that
a self-hoster runs the whole thing with one `docker compose` overlay and no extra
infrastructure.

`HiddenServiceNonAnonymousMode` is **never** set. Every service is an ordinary,
fully anonymous v3 hidden service. There is **no `Onion-Location` header**
anywhere — see §9 for why.

## 2. The three services

| Service | Address published? | Purpose |
| --- | --- | --- |
| Public download mirror | **Yes** — docs, sublemonable.com | APK distribution, censorship resistance |
| Secret resilience mirror | **No** — word-of-mouth only | Survives targeted takedown of the public mirror |
| Relay onion | **No** — baked into app binary | Client anonymity when messaging |

The two mirrors serve identical content: the static, no-JavaScript APK download
page, its stylesheet, the checksums, and the staged APK. The relay onion serves
**only the API** — it intentionally has no mirror, so an observer who watches both
onions cannot correlate the relay (messaging) service with the download service.

Host-gating logic, exactly as implemented:

```
Host == PUBLIC_ONION_ADDRESS  -> serve mirror
Host == SECRET_ONION_ADDRESS  -> serve mirror (identical content)
Host == RELAY_ONION_ADDRESS   -> fall through to API (no mirror)
Host == clearnet hostname / IP -> fall through to API (no mirror)
```

The match **fails closed**: an empty configured address never matches any
`Host`, so a misconfigured deployment serves no mirror rather than leaking it onto
every request. Only the public address is ever rendered into the mirror page; the
secret and relay addresses are never written into any template or API response.

## 3. Honest threat model

The relay onion provides **client anonymity and censorship resistance** — it does
**not** hide the server.

- **What is protected.** A client connecting through the relay onion does not
  reveal its IP address to the server: Tor terminates at the hidden service, so
  the server sees a Tor circuit, not the user. Clients in censored networks can
  reach the service because a hidden service has no blockable clearnet endpoint.
- **What is not protected.** The server's location is **not** hidden. The Hetzner
  IP is publicly associated with the service through clearnet DNS
  (`relay.sublemonable.com` and friends). Anyone can learn where the box is — this
  is by design, because the box also serves clearnet behind a reverse proxy.
- **Adversaries who can reduce anonymity.** An adversary able to correlate Tor
  traffic at both ends (entry and the known server location) can reduce a user's
  anonymity. A **global passive adversary** who observes the whole network is
  explicitly out of scope — no low-latency anonymity system defends against that,
  and we do not claim to.

In short: we protect *who is talking to the server*, not *where the server is*.

## 4. No TLS over onion

There is no TLS certificate on the onion services. The v3 `.onion` address is an
ed25519 public key — it **is** the cryptographic identity. A client that reaches
`<relay>.onion` has already authenticated the server by completing the hidden
service handshake to that exact key; wrapping TLS around it would authenticate the
same thing twice with a weaker (CA-based) trust model.

Certificate **pinning therefore applies only to clearnet connections**. Over the
relay onion, the address is the pin. (See `docs/SECURITY_MODEL.md` for the
clearnet pinning design.)

## 5. Key backup

Each hidden service generates, under its `HiddenServiceDir`:

- `hs_ed25519_secret_key` — the private key that *is* the `.onion` address
- `hs_ed25519_public_key`
- `hostname` — the `.onion` address in text form

These live in the `tor-data` Docker volume:

```
/var/lib/tor/sublemonable-mirror-public/
/var/lib/tor/sublemonable-mirror-secret/
/var/lib/tor/sublemonable-relay/
```

**Losing a key means losing that `.onion` address permanently** — there is no
recovery and no re-issuance; the address is the key. Back up all three
`hs_ed25519_secret_key` files **offline and off-server**, alongside the `.jks`
release keystore and the JWT signing keys. Treat them with the same care: anyone
with the secret key can impersonate that service.

## 6. Fallback chain

The client resolves an active transport along a **fixed, ordered chain — not a
user-selectable preference**:

```
I2P (primary)  ->  Tor (relay fallback)  ->  clearnet (last resort, warned)
```

This replaced the earlier v1.5 `tor_first` / `i2p_first` user-choice model. I2P
is the primary relay transport because its tunnels are unidirectional — a
client's inbound tunnel and outbound tunnel are built independently, so an
adversary attempting timing correlation must compromise two separately-built
paths rather than one shared circuit. That is a stronger fit for relay
(messaging) traffic than Tor's bidirectional circuits. Tor remains the fallback
specifically for its much larger anonymity set, which matters when I2P isn't
reachable. In v1.5 I2P is a skeleton (§7), so the chain always falls through to
Tor; live I2P support in a future release requires no change to the chain
itself, only to `detectI2P()`.

The download/mirror transport is unchanged and independent of this chain: Tor
onion primary, clearnet fallback (§2).

When the chain reaches clearnet, the app **shows a warning** and connects anyway
(unless the user has disabled clearnet fallback — see below):

> **Clearnet fallback active.** Your messages are still end-to-end encrypted and
> unreadable by the relay. However, your IP address may be visible. For full
> anonymity, ensure I2P or Tor is available on your device.

Transport anonymity and message confidentiality are independent: clearnet
fallback affects anonymity only — messages are still Signal Protocol encrypted
end-to-end regardless of transport. The warning is amber and dismissible **for
the session only** — it reappears on the next connection attempt, because the
trade-off is still in effect. A user who sets *Fallback to clearnet* to **off**
trades availability for safety: the app then reports "I2P and Tor unavailable —
connection refused" and does not connect over clearnet at all.

## 7. I2P — status and scope

I2P is a **live relay transport** on the server and Linux desktop. It remains a
**skeleton on mobile (iOS, Android) and browser** — the same in-process SDK
constraint that blocks Tor on mobile (§8, `docs/V1_5_STATUS.md`) blocks I2P there
too.

### Server

`docker-compose.i2p.yml` runs a `purplei2p/i2pd` container configured as a server
tunnel: it creates an I2P destination (`.b32.i2p` address) derived from a
persistent key file and forwards inbound I2P connections to the Go server on
`server:8443`. The destination key (`sublemonable-relay.dat`) lives in the
`i2p-data` named volume; losing the volume means losing the B32 address permanently
— the same consequence as losing an onion key, so back up the volume alongside the
`hs_ed25519_secret_key` files (§5). Host-gating is automatic: an I2P client sends a
`Host: <b32addr>.b32.i2p` header, which does not match `PUBLIC_ONION_ADDRESS` or
`SECRET_ONION_ADDRESS` (both `.onion`), so `isMirrorHost()` returns false and the
request falls through to the API. The relay is API-only over I2P by construction,
with no extra configuration needed.

### Linux desktop

On startup the app probes `127.0.0.1:4444` (the i2pd default HTTP proxy) with a
short TCP timeout. If it answers, `i2p::detect_and_announce()` emits
`connection-mode-changed` with `mode = "i2p"` and returns `true`; the Tor probe is
then skipped entirely (I2P is primary in the fixed hierarchy). The frontend
`detectI2P()` in `transportResolver.ts` calls the Tauri `check_i2p_connectivity`
command on the Tauri path.

REST traffic is routed through a separate `reqwest` client configured with an HTTP
proxy at `127.0.0.1:4444` (`i2p_request` Tauri command). The relay I2P destination
is baked in at build time via `RELAY_I2P_DEST`; the Rust command validates the
target URL's host against this constant before routing. No TLS: the `.b32.i2p`
address is the cryptographic identity of the destination (same principle as §4 —
authentication happens at the I2P layer).

**WS-over-I2P: confirmed blocked (two layered failures, both verified against live
code):**

1. **Library has no proxy support.** `tokio_tungstenite::connect_async_tls_with_config()`
   connects directly to the URL's hostname via DNS — no proxy features exist in
   `tokio-tungstenite = "0.24"` (features: `connect`, `rustls-tls-webpki-roots`
   only). No configuration change can route it through `127.0.0.1:4444`.

2. **`.b32.i2p` is not resolvable via standard DNS.** The connection attempt fails
   at DNS resolution before any proxy could intercept it.

The fix requires implementing HTTP CONNECT tunneling in Rust before the WebSocket
handshake: `TcpStream::connect("127.0.0.1:4444")` → `CONNECT <b32>:80 HTTP/1.1`
→ `200 Connection established` → pass the resulting stream to
`tokio_tungstenite::client_async_with_config()`. This is implementable but is
non-trivial new code requiring its own testing pass on a live I2P network.
`TODO(i2p-ws-verify)` in `i2p.rs` is **not closed**. WebSocket falls back to the
Tor/clearnet `ws_open` command until this is implemented and verified.

### Mobile (iOS, Android) — blocked

No production-ready I2P router SDK for iOS or Android exists for in-process
embedding. `detectI2P()` always returns false on mobile; the chain falls through to
Tor. Adding in-process I2P on mobile is tracked in `docs/V1_5_STATUS.md` as a
future item with the same dependency class as in-process Tor (Guardian Project
`Tor.framework` / `tor-android`).

### Browser — blocked

Browser JavaScript cannot control proxy settings. `detectI2P()` returns false in
the browser; the fallback chain reaches Tor (detected by `.onion` hostname) or
clearnet. No structural change is needed to fix this — the constraint is
platform-imposed.

### Threat model comparison

I2P and Tor serve partially different threat models: I2P is stronger for traffic
that stays inside its own network (no exit nodes) and its unidirectional tunnels
raise the cost of timing correlation (§6); Tor is stronger for exit traffic and
has a much larger anonymity set. The fixed hierarchy uses I2P first for relay
traffic and falls back to Tor rather than offering a user choice, so every client
gets the stronger default without needing to understand the tradeoff.

## 8. Community relay nodes

Any operator can run a relay using the Docker Compose overlay — build from source,
bring up the Tor overlay, and read the relay onion address. The app currently
ships with the official relay address baked in.

In **v2**, an Algorand `RelayRegistry` smart contract handles **permissionless
relay discovery**: operators register their relay on-chain and clients discover
the set without a central list. Until then, relay distribution is the single baked
address. Setup instructions live in
[`docs/SELF_HOSTING.md`](SELF_HOSTING.md).

## 9. What is not done

Stated plainly, so nobody mistakes scope for a security claim:

- **The server location is not hidden.** This is not a goal for v1.5 (§3). The
  Hetzner IP is public.
- **`HiddenServiceNonAnonymousMode` is never used.** Every service is a normal
  anonymous v3 hidden service.
- **No `Onion-Location` header — anywhere.** This is deliberate. `Onion-Location`
  would auto-advertise an onion address to clearnet visitors; we never want to
  auto-discover the **secret** mirror, and we do not add it for the public mirror
  either, to keep the behaviour uniform and the secret mirror un-leakable.
- **I2P eepsite (a mirror served over I2P) is not built yet** (§7).
- **Separate-box resilience mirrors** (true geographic redundancy across distinct
  machines) are **deferred** until the project has traction. Today the "secret"
  mirror shares a box with the public one — it survives a *takedown of the public
  address*, not a seizure of the server.

## 10. Testing checklist

After deployment, verify:

- [ ] `docker compose exec tor cat /var/lib/tor/sublemonable-mirror-public/hostname` — prints a valid `.onion`
- [ ] `docker compose exec tor cat /var/lib/tor/sublemonable-mirror-secret/hostname` — different address from public
- [ ] `docker compose exec tor cat /var/lib/tor/sublemonable-relay/hostname` — different address from both mirrors
- [ ] Tor Browser → public `.onion` → index page renders with download section (APK staged) or staging guidance (not staged). No API routes visible.
- [ ] Tor Browser → secret `.onion` → same mirror page. No API routes visible.
- [ ] Tor Browser → relay `.onion` → API responds (e.g. `/healthz`). Mirror page does **not** render.
- [ ] Clearnet `relay.sublemonable.com` → API responds. Mirror page does **not** render.
- [ ] Direct IP probe on port 8443 (no `Host` header) → API responds. Mirror does **not** render.
- [ ] App on clearnet → settings show "Clearnet fallback active" warning banner.
- [ ] App connected via relay `.onion` → no warning banner, badge shows Tor active.
- [ ] Fixed-chain fallback order: with i2pd not running (I2P unreachable), Tor
      available → badge shows Tor active, no user-facing choice offered in Settings → Network.
- [ ] Fixed-chain fallback order: with I2P and Tor both unreachable → clearnet fallback banner
      reads "Clearnet fallback active" (or connection is refused if fallback is disabled).
- [ ] Three `hs_ed25519_secret_key` files backed up offline.
