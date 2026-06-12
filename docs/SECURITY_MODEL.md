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
  user's passphrase via Argon2id (memory 65536 KB, iterations 3, parallelism 4). Keys exist in
  plaintext only in memory while the app is unlocked.
- **iOS:** Identity key in the Secure Enclave where available; all key material in the Keychain,
  biometric-protected (Face ID / Touch ID).
- **Android:** Android Keystore System, hardware-backed where the device supports it; remaining
  local data in EncryptedSharedPreferences.

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
  (Android), Service Worker intercept with HPKP-style validation (web)
- **Auth:** JWT (RS256, 15-minute expiry) with refresh tokens (7 days, rotated on every use)
- **Headers:** HSTS with preload, strict CSP, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`, locked-down Permissions-Policy

## Screenshot protection per platform

| Platform | Mechanism | Strength |
| --- | --- | --- |
| Android | `WindowManager.LayoutParams.FLAG_SECURE` on every Activity with message content | OS-level hard block — captures show black |
| iOS | `UIScreen.capturedDidChangeNotification` → instant blur overlay; `userDidTakeScreenshotNotification` → warning banner | Real-time blur for recording; detection (not prevention) for stills |
| Web | `visibilitychange` + window blur → `filter: blur(24px) grayscale(1)` on the message container within 120 ms | Best-effort — full OS-level prevention is out of scope in a browser |

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
- Full OS-level screenshot prevention in a browser

## Tor routing

Tor is opt-in, not default. Mobile clients integrate with Orbot; browser users can reach the
deployment's `.onion` address via Tor Browser. The server ships an optional nginx + tor hidden
service configuration (`docker-compose.tor.yml`).

## Contact verification

Contacts verify each other by comparing Safety Numbers — a SHA-512 fingerprint of both identity
keys — rendered in JetBrains Mono and as a QR code. In-person verification is recommended for
high-security contacts. A changed key triggers a prominent warning until re-verified.

## Audit history

See [AUDIT.md](../AUDIT.md). No third-party audits have been completed yet — treat the
implementation accordingly.
