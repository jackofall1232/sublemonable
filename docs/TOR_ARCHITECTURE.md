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

The client resolves an active transport along an explicit, ordered chain:

```
preferred (Tor or I2P)  ->  the other  ->  clearnet (last resort, warned)
```

With the default `tor_first` preference that is **Tor → I2P (future) →
clearnet**. The user picks Tor-first or I2P-first in Settings → Network; in v1.5
I2P is a skeleton (§7), so it is always skipped.

When the chain reaches clearnet, the app **shows a warning** and connects anyway
(unless the user has disabled clearnet fallback — see below):

> **Tor unavailable — using clearnet.** Your connection is not routed through Tor.
> Your IP address may be visible to the relay.

The warning is amber and dismissible **for the session only** — it reappears on
the next connection attempt, because the trade-off is still in effect. A user who
sets *Fallback to clearnet* to **off** trades availability for safety: the app
then reports "Tor unavailable — connection refused" and does not connect over
clearnet at all.

## 7. I2P — intent and scope

I2P is wired as a **skeleton** in v1.5. In place today:

- the transport type (`PreferredTransport`, the `i2p` `TransportState`),
- settings persistence (`preferredTransport` survives a restart on every
  platform), and
- the fallback chain (`resolveTransport` calls `detectI2P()` in the right place).

**Not** implemented: any live I2P traffic. `detectI2P()` always returns `false`,
so selecting "I2P first" logs intent and falls straight through to Tor.

When I2P is enabled in a future release, the relay will publish an I2P destination
address and the app will detect a local I2P proxy (typically `127.0.0.1:4444`) or
a SAM bridge and route WebSocket and REST traffic through it. The function
signature and call site already exist, so that work requires no structural change.

I2P and Tor serve partially different threat models: I2P is stronger for traffic
that stays inside its own network (no exit nodes), while Tor is stronger for exit
traffic and has a much larger anonymity set. Offering both, with the user's
preference persisted, lets the client pick the better tool once both are live.

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
- [ ] App on clearnet → settings show "Tor unavailable" warning banner.
- [ ] App connected via relay `.onion` → no warning banner, badge shows Tor active.
- [ ] Settings → Network → toggle "I2P first" → settings persist, label shows "coming soon", Tor still active.
- [ ] Three `hs_ed25519_secret_key` files backed up offline.
