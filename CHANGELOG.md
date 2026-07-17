# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.5-beta] - 2026-07-17

### Fixed

- **Android: the three Settings toggles that did nothing now function.** "Default disappearing
  timer" and "Burn on read by default" were one-shot seeds of per-chat saveable compose-bar state
  that nothing re-read — a restored stale snapshot shadowed the setting and the send path never
  consulted it. The compose bar now derives live effective values (per-message override, else the
  current setting), so toggling a default actually changes what gets sent. "Send read receipts"
  toggled a stored preference no code consumed on either side of the wire — see Added.
- **Android: burn-on-read burned the instant a message rendered in an open chat.** It now stays
  readable for a 5-second grace window after first view, then burns and notifies the sender — the
  propagated burn doubling as the read confirmation is the design intent, so the delay applies on
  both devices.

### Added

- **Android: read receipts, server-blind.** Receipts ride INSIDE ordinary encrypted message
  envelopes as control payloads (`packages/protocol/src/receipts.ts`) — on the wire a receipt is
  indistinguishable from conversation text, so the relay never learns read status, not even that a
  receipt exists. Every plaintext (messages AND receipts) is padded to 256-byte blocks before
  encryption so ciphertext length can't fingerprint a receipt either. Gated on the "Send read
  receipts" setting, batched per chat-open, sent/read indicator on outgoing bubbles. Burn-on-read
  messages never produce a receipt — their propagated burn signal is the read confirmation. The
  web client recognizes and swallows receipt payloads; web-side receipt SENDING is deferred
  pending cross-client interop verification.
- **Android: branded notification sound with user override.**
- **iOS: port of the Android registration key-encoding and WebSocket fixes + on-device
  diagnostics** (raw 32-byte keys, `Sec-WebSocket-Protocol` auth, flat frames, plaintext padding,
  receipt swallowing, Settings → Connection diagnostics). Parse- and harness-verified only — NOT
  yet compiled with Xcode or tested on a device; no iOS release is cut from this.

## [1.5.4] - 2026-07-17

### Fixed

- **Android: messages never sent — the WebSocket handshake could not authenticate.** The v1.5.3
  Android client presented its JWT in an `Authorization: Bearer` header on the `/ws` upgrade, but
  the server's `/ws` middleware only reads `Sec-WebSocket-Protocol` (or a `?token=` query param) —
  so every handshake was rejected and the app sat on "Connecting…" forever, silently retrying.
  Verified against a local server build: the exact Android handshake fails, the subprotocol and
  query-param handshakes succeed. The client now sends the token via `Sec-WebSocket-Protocol`,
  matching the web client and the server contract.
- **Android: WebSocket frames used a nested `{type, payload}` shape the server has never spoken.**
  The server (server/internal/ws/hub.go) and packages/protocol/src/events.ts define FLAT frames —
  fields sit next to `type`. Even with a fixed handshake, every `message.send` earned
  `{"error":"bad_envelope"}` and every inbound `message.deliver` was dropped client-side (verified
  live against a local server build). All outbound frames are now flat (`message.burn` gained the
  required `peer_id`; typing events use `peer_id` not `recipient_id`) and inbound parsing reads
  flat fields. New unit tests pin the wire contract. Android's non-functional `presence.update`
  stub was removed outright rather than reshaped: the canonical event is an encrypted signal
  Android does not yet produce, and the server currently drops every presence frame from every
  client (its relay routes signals by a `peer_id` the presence event does not define), so a stub
  could only pin a dead, wrong shape. **iOS has the same two defects and is NOT fixed by this
  change** (tracked in `.l00prite/todos.md`).
- **Server: `/ws` auth failures returned 500 instead of 401.** The Fiber error handler flattened
  every error — including the `/ws` middleware's `fiber.ErrUnauthorized` — to
  `500 {"error":"internal"}`, so clients could not distinguish an expired/rejected token (fixable
  by re-authenticating) from a server fault, and blind-reconnected forever. Intentional 4xx
  statuses now pass through.
- **Server: `/ws` never echoed the `Sec-WebSocket-Protocol` back.** RFC 6455 §4.1 requires the
  echo when a client offers a subprotocol; browsers enforce it and drop the socket right after an
  otherwise-successful 101, so the web client's real-time delivery could never work in a browser.
  The middleware now echoes the offered subprotocol (and correctly does NOT when the token arrived
  via query param).

### Added

- **Android: send-path and socket-lifecycle diagnostics (Settings → Diagnostics).** The same
  privacy-safe logging that covered registration (v1.5.3) now covers what happens after: WebSocket
  handshake fired/connected/closed/failed (exception class + message + HTTP status), the token-
  rejected → re-auth hand-off, and every message-send stage (prekey-bundle fetch, X3DH session
  establishment, encrypt, socket hand-off) with stage name + exception metadata on failure. No
  message content, keys, tokens, or account IDs — fixed markers and exception metadata only. The
  send path previously swallowed every failure silently; a dead prekey fetch was indistinguishable
  from never having tapped send.

## [1.5.3] - 2026-07-15

### Added

- **Android: on-device connection diagnostics (Settings → Diagnostics).** A permanent,
  privacy-safe log of every registration/connection attempt — boot stage markers plus the
  transport error class and message on failure (e.g. a certificate-pinning rejection, a TLS
  handshake/version failure, or an unreachable relay) — written to an app-private file and shown
  as plain, selectable, copyable text. It requires no `adb`/`logcat` and no second machine, so a
  user stuck on “Connecting…” can read the exact failure and paste it into a bug report. The same
  lines still go to logcat under the `SublemonableBoot` tag when `adb` *is* available. The log is
  capped at the 50 most recent lines and is never backed up (`allowBackup=false`). It contains no
  message content, keys, tokens, or account IDs by construction.

## [1.5.2] - 2026-07-15

### Fixed

- **Android: opening Settings crashed the release build, every time.** The Settings route was the
  app's only user of `LifecycleResumeEffect` (lifecycle-runtime-compose). On Compose 1.6.x that API
  resolves its `LifecycleOwner` through a reflection shim into compose-ui's
  `AndroidCompositionLocals_androidKt`; R8 renamed that class in the minified v1.5.1 release APK
  (confirmed in the shipped dex), so the first composition of Settings threw
  `IllegalStateException: CompositionLocal LocalLifecycleOwner not present`. Debug builds — the only
  thing CI built — are not minified, so the crash never appeared there. The Orbot re-check on resume
  now uses compose-ui's `LocalLifecycleOwner` with a plain `DisposableEffect` observer (no
  reflection), the lifecycle-runtime-compose dependency is removed, a defensive keep rule pins the
  reflection target, and CI now also builds the minified release APK and asserts the kept class
  survives R8.

### Added

- **Android release-signing + publish pipeline.** `apps/android/app/build.gradle.kts` now wires a
  release `signingConfig` sourced from a gitignored `keystore.properties` (or env vars), falling back
  to an unsigned build when absent so keyless checkouts and CI still assemble. A new
  `.github/workflows/release-apk.yml` builds, signs (from opt-in GitHub Secrets behind a protected
  environment), verifies the signature, checksums, and publishes the APK as a GitHub Release —
  uploading an unsigned artifact plus offline-signing instructions when no keystore is configured.
  `docs/RELEASING_ANDROID.md` documents the local and CI paths, the signing-key continuity checks,
  and the website/mirror pointer flip.

## [1.5.1] - 2026-07-14

### Added

- **v1.5 — the security onion.** Five layered defenses, each assuming the one beneath it has failed:
  - **Plausible deniability**: key-slot vaults with a never-stored vault count and identical
    Argon2id timing on every passphrase path (`packages/crypto` `vault`).
  - **Dead-drop mode**: anonymous deposit under `SHA-256(token)` with no sender field, gated by a
    hashcash proof-of-work instead of an account; single-use redeem; 72-hour TTL purge.
  - **Decoy (cover) traffic**: Poisson-timed fake envelopes, padded to the same 256-byte block as
    real messages and sent over the same path, with low-battery back-off (`packages/relay-client`).
  - **Multi-hop relay**: 3-layer onion encryption with AS/geographic-diverse path selection, guard
    pinning, and 100-message / 10-minute circuit rotation; server `/relay/forward` peels one layer.
  - **Tor-first architecture**: Tor is the default transport; clearnet is a flagged fallback.
  - **Standard / Stealth / Ghost** connection modes composing the network layer.
  - **Privacy view**: frosted-lemon blur with hold / tap-timed / tap-toggle reveal modes.
  - **Platform warning**: honest, dismissible notice when a participant is on a browser.
  - 256-byte message padding, and an encrypted `contact.info` signal for real-time platform exchange.
- New `@sublemonable/relay-client` package (decoy scheduler, circuit construction, path selection).
- UI reconciled from the `lemon-ui.jsx` brainstorm into the dark design system: progressive
  lemon-wheel fill, bouncing-drop typing indicator, and the squeeze send button.
- **Desktop certificate-pinned transport.** Because the Linux app's WebView cannot pin TLS, the
  native Tauri layer (`apps/desktop/src-tauri/src/transport.rs`) now routes all REST and WebSocket
  traffic through a rustls client with a custom SPKI-pinning verifier; `apps/web` uses it
  automatically under Tauri and plain `fetch`/`WebSocket` in the browser.

### Security

- **TLS certificate pinning across all clients.** iOS, Android, and desktop validate the CA chain
  **and** pin the server's leaf SubjectPublicKeyInfo (SHA-256), failing closed on any mismatch — a
  mis-issued or MITM certificate is rejected even when it chains to a trusted CA. Each client now
  carries a primary and an offline-backup pin so the key can be rotated without an app update.
- Self-hosting guide documents the Caddy reverse proxy (durable pin via `reuse_private_keys`),
  computing your pins, the desktop pinned-transport build, and the key/pin rotation runbook.

## [1.0.0]

### Added

- Initial release
