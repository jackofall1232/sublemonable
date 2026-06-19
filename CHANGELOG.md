# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
