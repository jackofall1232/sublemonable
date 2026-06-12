<div align="center">

<img src="website/public/lemon-slice.svg" alt="Sublemonable lemon slice logo" width="96" height="96" />

# Sublemonable

**Nothing lasts. That's the point.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-F5E642.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/jackofall1232/sublemonable/ci.yml?branch=main)](.github/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/Platforms-iOS%20%7C%20Android%20%7C%20Browser-F5E642.svg)](#platforms)
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

Full details in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

## Features

- 🔐 End-to-end encryption via the Signal Protocol
- 🔥 Burn-on-read — destroyed everywhere after first open
- ⏱️ Disappearing messages with configurable TTL
- 📵 Screenshot protection — hard block on Android, instant blur on iOS and browser
- 🫥 Invisible watermarking for leak attribution
- 🪪 No phone number, email, or name required

## Platforms

| Platform | Stack | Path |
| --- | --- | --- |
| Browser | React 18 + Vite, PWA | [`apps/web`](apps/web) |
| iOS 16+ | SwiftUI + libsignal-client | [`apps/ios`](apps/ios) |
| Android 8+ | Jetpack Compose + libsignal-client | [`apps/android`](apps/android) |
| Server | Go 1.22+ · Fiber · PostgreSQL 16 | [`server`](server) |

## Getting started

See [docs/SETUP.md](docs/SETUP.md) for prerequisites, environment variables, and running the
server, web app, and mobile apps locally.

## Self-hosting

Sublemonable is designed to be self-hosted on a small VPS with Docker Compose, including an
optional Tor hidden service. See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. All contributions must
preserve the zero-knowledge architecture.

## Security disclosure

Found a vulnerability? **Do not open a public issue.** Follow the responsible disclosure process in
[SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE) — anyone running a modified Sublemonable as a service must open source their
changes.
