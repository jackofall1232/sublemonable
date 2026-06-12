# Sublemonable for iOS

Zero-knowledge, end-to-end encrypted ephemeral messaging. SwiftUI, iOS 16+.

> Nothing lasts. That's the point.

## Requirements

- Xcode 15 or later (Swift 5.9+)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- A Rust toolchain — required to build LibSignalClient from source (see below)

## Build

```sh
cd apps/ios
xcodegen generate          # produces Sublemonable.xcodeproj from project.yml
open Sublemonable.xcodeproj
```

Select the `Sublemonable` scheme and run on a device or simulator. Note that
Secure Enclave key wrapping and biometrics are only fully exercised on a real
device; on the simulator the app falls back to biometric-protected keychain
items.

### Run the tests

```sh
xcodebuild test \
  -project Sublemonable.xcodeproj \
  -scheme Sublemonable \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

The unit tests cover pure logic only: burn-timer segment math, safety-number
formatting, and the message-envelope JSON wire contract (snake_case fields
shared with `packages/protocol` and the Go server).

### LibSignalClient build requirements

The Signal Protocol implementation comes from
[signalapp/libsignal](https://github.com/signalapp/libsignal), consumed as a
Swift package (pinned to the `0.56.x` line in `project.yml`). Its core is
Rust, so the first build needs `rustup`-installed toolchains with the iOS
targets:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

If you bump the package version, re-verify the API mapping documented at the
top of `Sources/Crypto/SignalManager.swift` — the store-protocol and
free-function signatures occasionally change between libsignal releases.

## Certificate pin — self-hosters MUST replace this

`Sources/Networking/PinnedSessionDelegate.swift` ships with a **placeholder**
SPKI pin that rejects every server. Compute the SPKI (public key) pin of your
deployment's TLS certificate and replace it — the value is identical to the
one Android's `CertificatePinning.kt` uses, in OkHttp's `sha256/<base64>`
format:

```sh
openssl s_client -connect your.server:443 < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | base64
```

Also point `APIClient.defaultBaseURL` and `WebSocketClient.defaultURL` at your
server. SPKI pinning survives certificate renewals that keep the same key
pair; add your backup key's pin as a second entry before rotating key pairs,
ship the update, then drop the old pin. TLS 1.3 is the enforced
minimum, and the same pin is applied to both the REST client (URLSession) and
the WebSocket (Starscream).

## Optional Tor via Orbot

Settings → Network → "Route through Tor (Orbot)" is strictly opt-in (off by
default). On iOS, [Orbot](https://orbot.app) runs as a system-wide VPN, so
once its VPN is up, all Sublemonable traffic rides through Tor with no app
changes. The toggle uses the `orbot://` URL scheme (declared in
`LSApplicationQueriesSchemes`) to detect Orbot and deep-link the user into it;
it cannot verify the circuit itself — open Orbot to confirm it's connected.

## Security properties enforced in this codebase

- **No plaintext at rest** — decrypted messages live in memory only
  (`MessageStore`); key material lives in the data-protection keychain behind
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + `.biometryCurrentSet`, and
  the identity key is additionally ECIES-wrapped under a Secure Enclave key.
- **No logging of content, no analytics, no telemetry, no crash reporting** —
  anywhere, ever.
- **Screen recording** → instant material blur over everything
  (`CaptureDetector` + `CaptureShieldOverlay`, ≤120ms).
- **Screenshots** → cannot be prevented on iOS; detected after the fact,
  warning banner shown, event recorded locally only.
- **Backgrounding** → content blurs before the app-switcher snapshot.
- **Notifications** → always exactly "New message"; the
  `NotificationService` extension rewrites any payload down to that.
- **Ephemerality** → delivery acks trigger immediate server-side deletion;
  TTL and burn-on-read destroy local plaintext on both sides (the burn is a
  600ms upward particle dissolve — never a fade).

See `docs/SECURITY_MODEL.md` at the repository root for the full model.

## Layout

```
apps/ios
├── project.yml                  # XcodeGen definition (app + extension + tests)
├── Support/Info.plist
├── NotificationService/         # content-free notification extension
├── Sources
│   ├── SublemonableApp.swift    # entry: splash → onboarding → biometric gate → chats
│   ├── Crypto/                  # SignalManager (libsignal), KeychainStore, SafetyNumber
│   ├── Networking/              # APIClient, WebSocketClient, cert pinning, Orbot
│   ├── Data/                    # MessageEnvelope (wire contract), Message/Conversation stores
│   ├── Security/                # capture/screenshot/background detection, jailbreak heuristics
│   ├── Notifications/           # content-free local notifications
│   └── UI
│       ├── Theme/               # design tokens (colors, type, spacing, motion)
│       ├── Components/          # LemonSlice first — then bubbles, compose bar, shields…
│       └── Screens/             # Splash, Onboarding, ChatList, Chat, Settings, Verification
└── Tests/                       # pure-logic XCTests
```

## Fonts

The design system specifies Clash Display, Inter, and JetBrains Mono. Font
files are not vendored in this repository; `SubFont` (in
`Sources/UI/Theme/Typography.swift`) falls back to system equivalents — and
key fingerprints always fall back to the `.monospaced` system design, never a
proportional face. To ship the real fonts, add the `.ttf`/`.otf` files to a
`Resources/Fonts` group, list them under `UIAppFonts` in `Support/Info.plist`,
and add the path to the target's sources in `project.yml`.

## License

AGPL-3.0-only. Every source file carries the license header; see `LICENSE` at
the repository root.
