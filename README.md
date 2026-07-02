<div align="center">

<img src="website/public/lemon-slice.svg" alt="Sublemonable lemon slice logo" width="96" height="96" />

# SubLEMONable

**Nothing lasts. That's the point.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-F5E642.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/jackofall1232/sublemonable/ci.yml?branch=main)](.github/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/Platforms-iOS%20%7C%20Android%20%7C%20Linux%20%7C%20Browser-F5E642.svg)](#platforms)
[![Encryption](https://img.shields.io/badge/Encryption-Signal%20Protocol-F5E642.svg)](docs/SECURITY_MODEL.md)

</div>

## What is Sublemonable?

Sublemonable is end-to-end encrypted ephemeral messaging for browser, iOS, and Android. Every
message is encrypted on your device with the Signal Protocol (X3DH + Double Ratchet) before it goes
anywhere, and the server deletes each message the instant it's delivered. Messages can burn on read
or self-destruct on a timer — from 30 seconds to a week — enforced on both sides of the
conversation.

We built it zero-knowledge from the ground up: the server stores public keys and opaque encrypted
envelopes, nothing else. No phone number, no email, no name — your identity is a key pair generated
on your device, and contacts connect by QR code or link. Screenshots are blocked outright on
Android and trigger an instant blur on iOS and browser, with invisible watermarking for leak
attribution.

## Security model

- **Zero-knowledge server** — plaintext never leaves your device; the server can't read messages even if compromised
- **Signal Protocol** — X3DH key agreement + Double Ratchet with per-message keys and forward secrecy
- **Store-and-forward only** — messages purged from the server immediately on delivery acknowledgement
- **No metadata hoarding** — no IP logging, no contact lists, no device identifiers stored
- **Argon2id** key derivation for all passphrases; hardware-backed key storage on mobile
- **TLS 1.3 + certificate pinning** — every client pins the server's leaf public-key (SPKI) hash and
  fails closed on a mismatch, so a mis-issued or MITM certificate is rejected even if it chains to a
  trusted CA (enforced natively on desktop, where the WebView cannot pin)

Full details in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

## Features

- 🔐 End-to-end encryption via the Signal Protocol
- 🔥 Burn-on-read — destroyed everywhere after first open
- ⏱️ Disappearing messages with configurable TTL
- 📵 Screenshot protection — hard block on Android, instant blur on iOS and browser
- 🫥 Invisible watermarking for leak attribution
- 🪪 No phone number, email, or name required
- 📌 TLS 1.3 with certificate pinning on every client — fail-closed against MITM, even on the desktop WebView
- 🖥️ Native Linux desktop app — .deb, .AppImage, .rpm — with libsecret key storage and focus-loss screenshot blur

### v1.5 — the security onion

Five layered defenses, each built as if the one beneath it has already failed:

- 🧅 **Plausible deniability** — two separate vaults behind two passphrases, with no cryptographic
  evidence the second exists and identical unlock timing for both
- 📨 **Dead-drop mode** — anonymous, account-free message deposit; no metadata links the two parties
- 🌫️ **Decoy traffic** — continuous cover traffic makes a real send indistinguishable from idle
- 🔀 **Multi-hop relay** — 3-hop onion routing; no single relay knows both ends
- 🧅 **I2P-first** — I2P is the primary transport (still in development — Tor is the active
  fallback today), clearnet only as a flagged last resort
- 👻 **Standard / Stealth / Ghost** connection modes
- 🍋 **Privacy view** — frosted-lemon blur until you reveal, for shoulder-surfing defense

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for the full onion diagram.

## Platforms

| Platform                   | Stack                                | Path                           |
| -------------------------- | ------------------------------------ | ------------------------------ |
| Browser                    | React 18 + Vite, PWA                 | [`apps/web`](apps/web)         |
| iOS 16+                    | SwiftUI + libsignal-client           | [`apps/ios`](apps/ios)         |
| Android 8+                 | Jetpack Compose + libsignal-client   | [`apps/android`](apps/android) |
| Linux (Debian/Ubuntu/Kali) | Tauri v2 + Rust, .deb/.AppImage/.rpm | [`apps/desktop`](apps/desktop) |
| Server                     | Go 1.25+ · Fiber · PostgreSQL 16     | [`server`](server)             |

## Getting started

See [docs/SETUP.md](docs/SETUP.md) for prerequisites, environment variables, and running the
server, web app, and mobile apps locally.

## Self-hosting

Sublemonable is designed to be self-hosted on a small VPS with Docker Compose, including an
optional Tor hidden service. See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

The Tor overlay also serves a static no-JS download mirror at the root of the `.onion`. Two
operational notes:

- **Hybrid by design.** Clearnet API and the Tor hidden service coexist. The static mirror is
  Host-gated — it is served only to requests whose `Host` is your `ONION_ADDRESS`, so clearnet
  visitors and scanners get the API only, never the mirror. Set `ONION_ADDRESS` or the mirror
  fails closed.
- **Stage the APK yourself.** Release artifacts (`*.apk`, `*.aab`, keystores) are **not committed**
  to this repo. Drop the released APK into `onion-site/` and run
  `sha256sum onion-site/*.apk > onion-site/SHA256SUMS` before enabling the mirror. If no APK is
  staged, the page hides the download link and shows staging guidance instead of a dead 404. See
  the [self-hosting guide](docs/SELF_HOSTING.md#stage-the-apk-before-enabling-the-mirror).

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. All contributions must
preserve the zero-knowledge architecture.

## Security disclosure

Found a vulnerability? **Do not open a public issue.** Follow the responsible disclosure process in
[SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE) — anyone running a modified Sublemonable as a service must open source their
changes.
