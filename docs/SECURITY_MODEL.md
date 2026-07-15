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

#### Identity-key signing scheme differs by platform (server accepts both)

The X25519 (Curve25519) public key used for X3DH's Diffie-Hellman step is
consistent everywhere, but **how the identity key signs the signed prekey and
the login challenge currently differs by platform**, because two different
crypto stacks are in use (see "Libraries" above):

- **Android/iOS** (`libsignal-client`): a single Curve25519 keypair is
  generated (`IdentityKeyPair.generate()`); the same private scalar signs
  directly via **XEdDSA**
  (https://moderncrypto.org/mail-archive/curves/2014/000205.html), libsignal's
  Curve25519-native signing scheme. No separate Ed25519 keypair ever exists.
- **Web/desktop** (`libsodium.js`, `packages/crypto/src/keys.ts`): a genuine
  **Ed25519** keypair is generated first (`crypto_sign_keypair`); its X25519
  form is derived separately, only for the X3DH DH step
  (`crypto_sign_ed25519_pk_to_curve25519`). Signing uses standard Ed25519
  (`crypto_sign_detached`) over the identity key's own Ed25519 form directly.

The published `identity_key` is therefore a Curve25519 u-coordinate from
mobile clients but a genuine Ed25519 point from web/desktop — and the two
platforms sign different byte strings for a signed prekey (mobile signs
libsignal's 33-byte type-tagged `serialize()` form; web/desktop signs the raw
32-byte prekey directly). The server verifies both conventions
(`server/internal/auth/xeddsa.go`'s `VerifyXEdDSA`, tried alongside plain
`ed25519.Verify` in `Register`/`UploadPrekeys`/`VerifyLogin`) rather than
picking one, so neither platform's client needs to change. This split was
discovered while investigating a registration bug that affected mobile only
(web/desktop's Ed25519 path was — and still is — correct); see
`.l00prite/ledger.md` Run 12–14 for the full investigation and the reasoning
for accepting both instead of converging on one. Converging every platform on
a single scheme remains open (tracked in `.l00prite/todos.md`) but is a
separate, larger change, not required for correctness today.

## Key generation and storage per platform

- **Web:** Keys live inside the multi-vault image — a single fixed-size record in IndexedDB (see
  the plausible-deniability section below for the on-disk layout). Each vault's keystore is padded
  to a constant payload size and encrypted with AES-256-GCM under that vault's random key; the
  vault key is unwrapped from a key slot whose per-slot master key is derived from the user's
  passphrase via Argon2id (memory 65536 KB, iterations 3). Note: `libsodium.js` uses an
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
| Linux (Wayland & X11) | Focus-loss blur overlay (same mechanism as the browser) | Best-effort — no compositor-agnostic API exists on Linux to hard-block screen capture |

The web client additionally embeds an **invisible watermark** (canvas steganography encoding
`recipient_id` + timestamp into message backgrounds) so a leaked screenshot can be attributed to
the recipient who leaked it.

**Watermark tradeoff (deliberate).** The watermark cuts against the rest of the metadata-minimization
design, and we keep it anyway — with eyes open:

- It embeds the viewing account's UUID, the conversation peer's account UUID, and a timestamp into
  the chat background — one watermark per conversation view, not per message. The encoding is
  public (this is open source), so _anyone_ holding a lossless capture — not just the sender — can
  extract **both** parties' account UUIDs and bind the two accounts to one conversation at a point
  in time. That is identifying, linking material deliberately added to otherwise identifier-free
  content: a leaked capture is evidence of the very account-to-account association the rest of the
  design denies the server.
- It only survives lossless captures: LSB steganography is destroyed by JPEG recompression, resizing,
  or re-photographing a screen. It deters casual screenshot leaks; it does not stop a determined
  leaker, who can trivially strip it.
- The exposure is bounded in one dimension only: account UUIDs are pseudonymous (no phone/email/name
  behind them), and they appear only in captures of content the leaking party could already see.

We judge leak attribution — a sender being able to prove _which_ counterparty's screen a capture
came from — worth that exposure. Users for whom any embedded identifier, or any capturable proof
that two accounts converse, is unacceptable should weigh this before relying on the web client for
content they may be compelled to defend.

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
- Full OS-level screenshot prevention in a browser or on Linux desktop (Linux exposes no
  compositor-agnostic hard-block API; the desktop app falls back to the same best-effort blur as
  the browser)

## Tor routing

In v1.0, Tor is opt-in, not default. Mobile clients integrate with Orbot; browser users can reach
the deployment's `.onion` address via Tor Browser. The server ships an optional nginx + tor hidden
service configuration (`docker-compose.tor.yml`). **As of v1.5 this is inverted — an anonymous
transport is the default and clearnet is a flagged fallback, along a fixed hierarchy: I2P is the
primary relay transport, Tor is the fallback when I2P is unavailable; see the transport hierarchy
section below.**

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
        │ │   TLS 1.3 · cert pinning · I2P-first · 3-hop relay ·   │   │
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
- **On-disk image.** Everything at rest is ONE fixed-size byte image stored under a single
  IndexedDB key (or handed as one opaque blob to the desktop keystore adapter):
  `version(1) ‖ SLOT_COUNT × [salt(16) ‖ wrapped key(60)] ‖ SLOT_COUNT × payload(256 KiB)`. Every
  payload region is exactly the same size whether it holds a real vault or filler. A real payload
  is the vault's keystore padded to the region's full plaintext capacity and **then** encrypted
  (pad-then-encrypt — the length prefix sits inside the AEAD ciphertext, so no plaintext structure
  ever reaches disk); a filler payload is uniform CSPRNG output, indistinguishable from ciphertext.
  The image size is a compile-time constant regardless of vault count. Deleting a vault overwrites
  its slot and payload with fresh random bytes — the image never shrinks, moves, or records that a
  vault was ever there. Because every payload region is the same size, unlocking any vault performs
  identical cryptographic work (per-slot Argon2id and a constant-size payload decrypt), preserving
  the timing-parity contract. The one residue: post-decrypt JSON parsing of the winning vault scales
  with its contents — low single-digit milliseconds against seconds of fixed KDF work, and it occurs
  only after the vault is already being opened for display.

This mirrors the VeraCrypt hidden-volume legal model: a user compelled to reveal passphrase A opens
a real, working profile while revealing nothing about whether passphrase B exists.

Two VeraCrypt-analogous caveats apply, and are accepted deliberately:

- **Multi-snapshot diffing.** An adversary who images the disk at two points in time can see which
  slot's payload region changed between snapshots, revealing that _that slot_ is live. A single
  snapshot — the compelled-disclosure scenario the design targets — reveals nothing. This is the
  same bound VeraCrypt hidden volumes accept.
- **Blind overwrite on vault creation.** Which slots hold live vaults is unknowable from storage —
  that is the point — so creating a new vault into an existing image picks a random slot and can
  destroy a vault whose passphrase is not currently entered, exactly as writing to a VeraCrypt
  outer volume without mounting the hidden one can. Creating a vault on a device that may hold
  others is a deliberate, documented risk.

### Transport hierarchy (I2P primary, Tor fallback)

An anonymous transport is now the **default**; clearnet is a fallback shown with a visible warning
indicator (a yellow dot on the connection-mode badge — informative, not alarming). The relay
transport hierarchy is **fixed, not user-selectable**: I2P is the primary relay transport, Tor is
the fallback when I2P is unavailable, and clearnet is the last resort. This replaced the earlier
v1.5 `tor_first`/`i2p_first` user-choice model. Native clients run Tor in-process (Guardian Project
`Tor.framework` / `tor-android`) with no Orbot dependency; browser clients auto-detect an `.onion`
host. Only v3 onion addresses are used. Full rationale for I2P-first is in
[`docs/TOR_ARCHITECTURE.md`](TOR_ARCHITECTURE.md) §6.

Transport anonymity and message confidentiality are independent: clearnet fallback affects
anonymity only — it never weakens encryption. Messages are Signal Protocol end-to-end encrypted
regardless of which transport carries them.

### Tor architecture (three hidden services)

The server runs **three** separate Tor v3 hidden services on the same box, sharing one Go binary and
one internal port and distinguished by the request `Host` header:

- **Public download mirror** — published; serves the static no-JS APK mirror.
- **Secret resilience mirror** — unpublished, word-of-mouth; identical mirror content, separate
  `.onion`, so it survives a targeted takedown of the public address.
- **Relay onion** — unpublished, baked into the app binary; serves the API only (no mirror), giving
  clients anonymity when messaging.

The honest anonymity claim is **client anonymity, not server anonymity**: the relay onion hides the
*client's* IP from the server, but the server's Hetzner IP is publicly associated with the service
via clearnet DNS. `HiddenServiceNonAnonymousMode` is never set, and no `Onion-Location` header is
ever emitted (it would auto-advertise the secret mirror).

The transport fallback chain is **I2P (primary) → Tor (fallback) → clearnet (last resort,
warned)** — fixed, not user-selectable. Clearnet fallback can be disabled in Settings → Network, in
which case the app refuses to connect rather than going clearnet. Full detail, including the
threat model and key backup, is in [`docs/TOR_ARCHITECTURE.md`](TOR_ARCHITECTURE.md).

| Threat | Protected? | Notes |
| --- | --- | --- |
| Client IP exposed to relay | ✅ via I2P or Tor | I2P is primary relay transport: live on server + Linux desktop (REST; WS unverified); skeleton on mobile/browser — chain falls to Tor which hides client IP via the relay onion |
| Server location hidden | ❌ | Hetzner IP is public; this is honest and documented |
| APK distribution takedown | Partial ✅ | Two mirrors (public + secret), more nodes planned |
| Clearnet traffic analysis | ⚠️ Fallback only | Clearnet is last resort with explicit warning; message confidentiality is unaffected — only anonymity |

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
