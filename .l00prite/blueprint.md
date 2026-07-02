# Project Blueprint

Populated directly from `sublemonable-MASTER.json`, `README.md`, `docs/V1_5_STATUS.md`, and
`docs/TOR_ARCHITECTURE.md` — this repo was already built and documented, so this blueprint
summarizes existing decisions rather than proposing new ones. `BRIEFING.md` was requested as a
source but does not exist anywhere in this checkout; nothing below depends on it.

## Mission

Sublemonable is a zero-knowledge, end-to-end encrypted, ephemeral messaging app for browser,
iOS, Android, and Linux desktop. Every message is encrypted on-device with the Signal Protocol
(X3DH + Double Ratchet) before it leaves the client; the server is a store-and-forward relay that
deletes each envelope the instant delivery is acknowledged and never sees plaintext. No phone
number, email, or name is required — identity is a device-generated key pair, contacts connect by
QR code or link. Messages can burn on read or self-destruct on a timer.

v1.5 ("the security onion") layers five additional defenses on top of the v1 zero-knowledge core,
each assuming the layer beneath it has already failed: plausible-deniability vaults, dead-drop
mode, decoy cover traffic, multi-hop onion relay, and a Tor/I2P-anonymized transport — see Memory
for the current state of the transport hierarchy.

Target users: people who need private communication with an honest, documented threat model —
the project is explicit about what it does and does not protect against (see
`docs/SECURITY_MODEL.md` §"Threat model" and `docs/TOR_ARCHITECTURE.md` §3 "Honest threat model").

## Architecture

Monorepo, pnpm workspaces (`pnpm@10.33.0`, Node >=20):

- `apps/web` — React 18 + Vite, PWA. Also the UI bundled into the desktop app via Tauri WebView.
- `apps/ios` — SwiftUI + `libsignal-client` (Swift Package), XcodeGen-generated project
  (`project.yml`, no committed `.xcodeproj`).
- `apps/android` — Jetpack Compose + `libsignal-client` (Maven), min SDK 26.
- `apps/desktop` — Tauri v2 + Rust. Wraps `apps/web`; native Rust layer does certificate-pinned
  TLS (`transport.rs`, `pinning.rs`) because the WebView can't pin TLS itself, plus keystore
  (`keystore.rs`) and screenshot (`screenshot.rs`) integration.
- `server` — Go 1.25+, Fiber v2 + Gorilla WebSocket, PostgreSQL 16, `sqlc` (no ORM). REST for
  auth/registration, WebSocket for messaging.
- `packages/crypto` — vault/key-slot crypto (`vault.ts`), padding, dead-drop tokens + hashcash PoW,
  3-layer onion encryption. **Do not touch without explicit sign-off — see constraints.md.**
- `packages/protocol` — shared TS types: connection modes, transport state/resolution, privacy
  view. Mirrored (kept "in lockstep," per in-file comments) by `ConnectionMode.swift` (iOS) and
  `ConnectionMode.kt` (Android).
- `packages/relay-client` — decoy scheduler (Poisson), circuit construction, AS/region diversity,
  guard-pinning.
- `packages/ui` — shared UI primitives (lemon-ui design system).
- `docs/` — `SECURITY_MODEL.md` (authoritative security reference), `TOR_ARCHITECTURE.md`,
  `SELF_HOSTING.md`, `SETUP.md`, `V1_5_STATUS.md`, `V1_AUDIT.md`.
- `tor/`, `docker-compose.tor.yml`, `onion-site/` — the three-hidden-service Tor overlay and its
  static no-JS APK mirror (staged manually, never committed).
- `website/` — marketing site, separate from the app.
- `Claude/` — v2 design blueprint (`sublemonable-v2-blueprint.json`) and a design preview HTML;
  out of scope for this pass.

`sublemonable-MASTER.json` is the single source of truth for the v1.0 and v1.5 specs (`versions`
key, `1.0.0` and `1.5.0`); the v2.0 spec lives separately in `Claude/sublemonable-v2-blueprint.json`
and is not part of current implementation work.

## Tech stack summary

| Layer | Stack |
| --- | --- |
| Encryption | Signal Protocol (X3DH + Double Ratchet), AES-256-GCM per-message keys, Argon2id KDF |
| Web crypto | `libsodium.js` (wrapped by `packages/crypto`) |
| Native crypto | `libsignal-client` (iOS Swift Package, Android Maven) |
| Web | React 18, Vite, Zustand, IndexedDB |
| iOS | SwiftUI, Secure Enclave/Keychain, XcodeGen |
| Android | Jetpack Compose, Android Keystore, EncryptedSharedPreferences |
| Desktop | Tauri v2, Rust, rustls (pinned TLS), Secret Service / libsecret / file fallback |
| Server | Go, Fiber v2, Gorilla WebSocket, PostgreSQL 16, sqlc |
| Anonymity network | I2P (primary relay transport) → Tor (fallback) → clearnet (last resort) — see memory.md |
| Download mirror | Tor v3 onion hidden services (public + secret), no-JS static page |

## Licensing and operating model

AGPL-3.0-only (see `LICENSE`). `README.md` states explicitly: "anyone running a modified
Sublemonable as a service must open source their changes." The repo is designed for self-hosting
on a small VPS (`docs/SELF_HOSTING.md`) — there is no hosted commercial SaaS offering, pricing
page, or company/business-entity documentation anywhere in the repo; it operates as a
community/self-hosted open-source project rather than a commercial product. `CONTRIBUTING.md`
requires an AGPL-3.0 header on every source file and forbids server-side logging, telemetry, and
weakened encryption defaults regardless of code quality otherwise.

## Requirements (already met, per README / V1_5_STATUS)

- [x] End-to-end encryption via Signal Protocol across web/iOS/Android.
- [x] Zero-knowledge server (opaque envelopes only, purged on delivery ack).
- [x] Burn-on-read and disappearing-message TTLs.
- [x] Screenshot protection (hard block Android, blur iOS/web/desktop) + invisible watermarking.
- [x] TLS 1.3 + certificate pinning on every client (native pinning; web relies on CA+HSTS).
- [x] Native Linux desktop app (.deb/.AppImage/.rpm) via Tauri.
- [x] v1.5 security-onion core: key-slot plausible-deniability vault crypto, 256-byte message
      padding, dead-drop tokens + hashcash PoW, 3-layer onion encryption, connection
      modes/decoy/privacy-view logic, decoy scheduler + circuit construction, server-side
      dead-drop + multi-hop relay endpoints — all with passing unit tests (see
      `docs/V1_5_STATUS.md`).
- [ ] Web multi-vault storage wiring — **done** as of `RUN_LEDGER.md` (multi-vault storage
      migration merged into `apps/web/src/lib/storage.ts` / `store.ts`); V1_5_STATUS.md predates
      that merge and should be read alongside RUN_LEDGER.md for the current picture.
- [ ] In-process Tor on iOS/Android (`Tor.framework` / `tor-android`) — not yet embedded; mobile
      currently uses opt-in Orbot integration, not v1.5's in-process design.
- [ ] Native v1.5 UI (connection-mode selector, privacy-view rendering, dead-drop QR, second-
      passphrase setup) — not wired into `SettingsView.swift` / `SettingsScreen.kt` yet; those
      screens still show the pre-v1.5 Orbot opt-in toggle. The v1.5 `ConnectionMode` type exists
      as a data model but has no native UI consumer.
- [ ] Background decoy tasks (iOS `BGProcessingTask`, Android `WorkManager`, web Service Worker) —
      foreground decoy generator/scheduler is done; backgrounding is unbuilt platform plumbing.
- [ ] QR generation/scanning for dead-drop token exchange — token is copy/paste only today.

## Definition of Done for this l00prite pass

- [x] `.l00prite/` memory populated from existing docs (this file and siblings).
- [x] I2P promoted from user-selectable preference to the fixed primary relay transport, with
      Tor as fallback and clearnet as last resort, across `packages/protocol`, the web app, and
      the iOS/Android data models.
- [x] `RELAY_ONION_ADDRESS` build injection verified across web/Android/desktop (already correct)
      and fixed on iOS (was self-referential and unwired).
- [x] Remaining operational deploy steps (server access, key backup, APK staging, etc.) recorded
      in `todos.md` rather than attempted in this session.

## Non-Execution Boundary

This blueprint documents the existing, already-implemented project. Future l00prite loops reading
this file should still not execute destructive or production-affecting operations (deploys, key
generation, server access) without explicit human sign-off — see `constraints.md`.
