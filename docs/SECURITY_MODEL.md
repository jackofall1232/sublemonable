# Sublemonable Security Model

This document describes the full technical security model for users and auditors. It is the
authoritative reference — if the code disagrees with this document, that's a bug (see
[SECURITY.md](../SECURITY.md)).

## Architecture overview

Sublemonable is a zero-knowledge, store-and-forward message relay. The server never sees, stores,
or logs plaintext message content under any circumstances — not by policy, but by construction.

```
┌──────────────┐        encrypted envelope         ┌──────────────┐
│  Sender       │ ────────────────────────────────▶ │  Server       │
│  device       │                                   │  (relay only) │
│               │   plaintext NEVER leaves device   │               │
│  • keys       │                                   │  • public     │
│  • encrypt    │                                   │    prekeys    │
│  • decrypt    │ ◀──────────────────────────────── │  • opaque     │
└──────────────┘        encrypted envelope          │    envelopes  │
                                                    └──────┬───────┘
                                                           │ deleted on
                                                           │ delivery ack
                                                    ┌──────▼───────┐
                                                    │  Recipient    │
                                                    │  device       │
                                                    └──────────────┘
```

The server's role is reduced to three functions:

1. Distributing **public** prekey bundles for X3DH key agreement
2. Relaying opaque encrypted envelopes between devices
3. Deleting envelopes the moment delivery is acknowledged

## Signal Protocol implementation

- **Key agreement:** X3DH (Extended Triple Diffie-Hellman) on first contact
- **Session encryption:** Double Ratchet — a new message key for every message, with DH ratchet
  steps providing forward secrecy and post-compromise security
- **Cipher:** AES-256-GCM per-message keys, discarded after use
- **Libraries:** `libsodium.js` (web, wrapped by `packages/crypto`), `libsignal-client` (iOS Swift
  Package and Android Maven)

### Key types

| Key | Curve | Lifetime | Notes |
| --- | --- | --- | --- |
| Identity key | Curve25519 | Long-term | Generated on device; **never leaves the device** |
| Signed prekey | Curve25519 | Rotated every 7 days | Signed by the identity key |
| One-time prekeys | Curve25519 | Single use | Batch of 100 public keys uploaded; consumed once |
| Session keys | — | Per session | Derived via X3DH, advanced by Double Ratchet |
| Message keys | AES-256-GCM | Single message | Derived per message, discarded after use |

## Key generation and storage per platform

- **Web:** Keys live in IndexedDB, encrypted with AES-256-GCM. The master key is derived from the
  user's passphrase via Argon2id (memory 65536 KB, iterations 3). Note: `libsodium.js` uses an
  internal Argon2id parallelism of 1 and exposes no lane parameter, so the web client cannot honor
  the spec's `parallelism: 4` literally; the value is applied consistently across all web
  derivations, and native clients use the spec value. Keys exist in plaintext only in memory while
  the app is unlocked.
- **iOS:** Identity key in the Secure Enclave where available; all key material in the Keychain,
  biometric-protected (Face ID / Touch ID).
- **Android:** Android Keystore System, hardware-backed where the device supports it; remaining
  local data in EncryptedSharedPreferences.
- **Linux:** Keys stored via the Secret Service API (GNOME Keyring on GNOME desktops, KWallet on
  KDE) using the secret-service Rust crate. If no Secret Service daemon is running, an
  Argon2id+AES-256-GCM encrypted file is used at $XDG_DATA_HOME/sublemonable/vault.bin. The
  encryption is performed by packages/crypto (libsodium.js) before the vault blob reaches the Rust
  storage layer — Rust is a storage adapter only.

## What the server stores — and provably cannot store

**Stored:**

- User account ID (UUID — not a username)
- Public identity key (Curve25519)
- Public prekeys (one-time and signed)
- Encrypted message envelopes (opaque blob only)
- Delivery receipts (hash of message ID only)
- Account creation timestamp

**Never stored:**

- Plaintext messages or message content of any kind
- IP addresses
- Device identifiers
- Contact lists
- Read receipts linked to identity
- Any logs that identify users

Messages are store-and-forward only: an envelope is deleted immediately when the recipient
acknowledges delivery, and undelivered envelopes are purged after 72 hours (the sender is
notified). Access logs are disabled; application logs cover errors and system events only and are
purged after 7 days.

## Transport security

- **Protocol:** WSS (WebSocket Secure) over TLS 1.3 for messaging; HTTPS REST for auth/registration
- **Certificate pinning:** NSURLSession pinned SHA-256 hash (iOS), OkHttp `CertificatePinner`
  (Android). **Web:** true certificate pinning is not available in browsers — HPKP was removed from
  every major browser and Service Workers cannot access the TLS certificate chain — so the web client
  relies on CA-chain validation plus HSTS preload. Users who require hard pinning should use the
  native iOS or Android client.
- **Auth:** JWT (RS256, 15-minute expiry) with refresh tokens (7 days, rotated on every use)
- **Headers:** HSTS with preload, strict CSP, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`, locked-down Permissions-Policy

## Screenshot protection per platform

| Platform | Mechanism | Strength |
| --- | --- | --- |
| Android | `WindowManager.LayoutParams.FLAG_SECURE` on every Activity with message content | OS-level hard block — captures show black |
| iOS | `UIScreen.capturedDidChangeNotification` → instant blur overlay; `userDidTakeScreenshotNotification` → warning banner | Real-time blur for recording; detection (not prevention) for stills |
| Web | `visibilitychange` + window blur → `filter: blur(24px) grayscale(1)` on the message container within 120 ms | Best-effort — full OS-level prevention is out of scope in a browser |
| Linux (Wayland) | xdg-desktop-portal ScreenSaver inhibit via ashpd | Hard block on supporting compositors (GNOME Shell, KDE Plasma on Wayland) — equivalent to Android FLAG_SECURE |
| Linux (X11) | Window compositor hints (_NET_WM_BYPASS_COMPOSITOR) + focus-loss blur overlay | Best-effort — X11 cannot provide a hard block; Wayland is recommended for strongest protection |

The web client additionally embeds an **invisible watermark** (canvas steganography encoding
`recipient_id` + timestamp into message backgrounds) so a leaked screenshot can be attributed to
the recipient who leaked it.

## Metadata minimization

- No phone number, email, or name required — discovery is by QR code or direct link
- Routing uses opaque UUIDs never exposed to other users directly
- Typing indicators and read receipts are sent as **encrypted signals** — the server can't read them
- Delivery receipts store only a hash of the message ID
- Account deletion is a full, irreversible purge: prekeys, pending envelopes, account record

## Threat model

**Protected against:**

- Server compromise — messages are encrypted before leaving the device
- Man-in-the-middle — certificate pinning + TLS 1.3
- Forward secrecy breach — Double Ratchet key rotation per message
- Screenshot leaks — platform-specific prevention and detection
- Metadata surveillance — minimal metadata, optional Tor routing
- Replay attacks — message nonces and timestamp validation
- Brute force — Argon2id key derivation for all passwords

**Out of scope:**

- A compromised device (OS-level keyloggers)
- Rubber-hose cryptanalysis
- Full OS-level screenshot prevention in a browser or on X11 (Wayland provides a hard block
  equivalent to Android)

## Tor routing

In v1.0, Tor is opt-in, not default. Mobile clients integrate with Orbot; browser users can reach
the deployment's `.onion` address via Tor Browser. The server ships an optional nginx + tor hidden
service configuration (`docker-compose.tor.yml`). **As of v1.5 this is inverted — Tor is the default
transport and clearnet is a flagged fallback; see the Tor-first section below.**

On Linux desktop, the app attempts Tor routing by default via a local tor daemon (port 9050) or Tor
Browser (port 9150). For full Tor routing without a running tor daemon, launch via: `torsocks
sublemonable`. The connection-mode badge shows Tor status — a yellow dot indicates clearnet fallback
is active.

## Contact verification

Contacts verify each other by comparing Safety Numbers — a SHA-512 fingerprint of both identity
keys — rendered in JetBrains Mono and as a QR code. In-person verification is recommended for
high-security contacts. A changed key triggers a prominent warning until re-verified.

## v1.5 — the security onion

v1.5 adds five layers on top of the v1 zero-knowledge core. The guiding principle is that **each
layer assumes the one beneath it has already failed**: a break in any single layer must not expose
the others.

```
        ┌─────────────────────────────────────────────────────────────┐
        │ Layer 1 — Physical                                           │
        │   panic wipe · duress PIN · plausible-deniability vaults ·   │
        │   FLAG_SECURE · biometric lock · background blur             │
        │ ┌───────────────────────────────────────────────────────┐   │
        │ │ Layer 2 — Network                                      │   │
        │ │   TLS 1.3 · cert pinning · Tor-first · 3-hop relay ·   │   │
        │ │   decoy traffic · obfs4                                │   │
        │ │ ┌───────────────────────────────────────────────────┐ │   │
        │ │ │ Layer 3 — Identity                                │ │   │
        │ │ │   no phone/email · UUID routing · Sealed Sender · │ │   │
        │ │ │   dead-drop mode · QR-only exchange               │ │   │
        │ │ │ ┌───────────────────────────────────────────────┐ │ │   │
        │ │ │ │ Layer 4 — Message                             │ │ │   │
        │ │ │ │   Signal Protocol · Double Ratchet ·          │ │ │   │
        │ │ │ │   256-byte padding · burn-on-read · TTL ·     │ │ │   │
        │ │ │ │   zero server logs                            │ │ │   │
        │ │ │ │ ┌───────────────────────────────────────────┐ │ │ │   │
        │ │ │ │ │ Layer 5 — Storage                         │ │ │ │   │
        │ │ │ │ │   Argon2id (identical timing) · PD vaults │ │ │ │   │
        │ │ │ │ │   AES-256-GCM at rest · Secure Enclave /  │ │ │ │   │
        │ │ │ │ │   Keystore · memory zeroing · secure del. │ │ │ │   │
        │ │ │ │ └───────────────────────────────────────────┘ │ │ │   │
        │ │ │ └───────────────────────────────────────────────┘ │ │   │
        │ │ └───────────────────────────────────────────────────┘ │   │
        │ └───────────────────────────────────────────────────────┘   │
        └─────────────────────────────────────────────────────────────┘
```

### Plausible deniability (key-slot vaults)

Two (expandable to four) completely separate encrypted vaults sit behind two different passphrases.
There is no cryptographic evidence that a second vault exists.

- **Key slots.** Every disk image holds a fixed `SLOT_COUNT` slots, each a 16-byte salt plus an
  AES-256-GCM-wrapped 32-byte vault key. Unused slots hold uniformly random bytes that are
  byte-for-byte indistinguishable from a real wrapped key. The integer number of vaults is never
  stored anywhere; a slot that fails to decrypt is indistinguishable from a wrong passphrase.
- **Timing parity.** `tryPassphrase` derives a key for, and attempts to unwrap, **every** slot with
  no early exit. The wall-clock time is identical whether a passphrase matches slot 0, slot 1, or
  nothing — a stopwatch cannot distinguish a decoy unlock from a real one. (See the timing-parity
  test in `packages/crypto`.)
- **Independence.** Each vault has its own random vault key and its own server account, identity key,
  and prekey bundle. The server cannot link them. Decrypted vault contents live in memory only and
  are zeroed on background.

This mirrors the VeraCrypt hidden-volume legal model: a user compelled to reveal passphrase A opens
a real, working profile while revealing nothing about whether passphrase B exists.

### Tor-first network

Tor is now the **default** transport; clearnet is a fallback shown with a visible warning indicator
(a yellow dot on the connection-mode badge — informative, not alarming). Native clients run Tor
in-process (Guardian Project `Tor.framework` / `tor-android`) with no Orbot dependency; browser
clients auto-detect an `.onion` host. Only v3 onion addresses are used.

### Dead-drop mode

Asynchronous, anonymous deposit with no direct channel between the two parties:

- A drop is a capability. A 256-bit one-time **token** is shared out of band; the relay stores the
  envelope under `drop_id = SHA-256(token)` and never sees the token until redemption.
- Deposit requires **no account** — a hashcash proof-of-work bound to the drop ID stands in for
  auth, so anonymous deposit costs CPU instead of being free to spam.
- The drop table has **no sender column**, by construction. Redemption presents the token, returns
  the envelope, and destroys the drop in one operation. A replayed token returns 404. Uncollected
  drops are purged at their 72-hour TTL.

### Decoy (cover) traffic

A background generator emits fake encrypted envelopes at Poisson-distributed intervals so that a
network observer cannot tell when a real message is sent — active and idle are indistinguishable. A
decoy is byte-for-byte the same size as a real message (both padded to 256-byte blocks), uses the
same submission path, and is addressed to a random UUID that resolves nowhere. Intensity is
selectable (off / low / medium / high) and auto-reduces on low battery.

### Multi-hop relay

Messages can be onion-routed through three relay nodes. Each layer is a sealed box to one relay's
Curve25519 key; a relay peels exactly one layer, learning only the next hop — never both ends of the
path. Path selection forbids two hops in the same Autonomous System and prefers geographic
diversity; circuits rotate after 100 messages or 10 minutes, and the guard (first) hop rotates only
weekly. An adversary must compromise all three relays *and* correlate timing — and decoy traffic
defeats the timing correlation.

### Connection modes

Three user-selectable bundles compose the network layer:

| Mode | Tor | Relay hops | Decoy traffic | Dead drop |
| --- | --- | --- | --- | --- |
| **Standard** | yes | 1 | off | no |
| **Stealth** | yes | 3 | medium | no |
| **Ghost** | yes | 3 | high | yes (every message) |

### Privacy view & platform warning (UI layer)

Two UI-only defenses that never touch the crypto or the envelope:

- **Privacy view** blurs message content behind a frosted lemon overlay, revealed only while you
  actively interact (hold-to-reveal, tap-timed, or tap-toggle). On a browser screenshot, the blurred
  state is what gets captured.
- **Platform warning** honestly tells a user when a participant is on a browser, where OS-level
  screenshot protection is unavailable — a dismissible lemon-yellow note, never a modal.

## Audit history

See [AUDIT.md](../AUDIT.md). No third-party audits have been completed yet — treat the
implementation accordingly.
