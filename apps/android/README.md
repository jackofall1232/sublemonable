# Sublemonable — Android

Kotlin + Jetpack Compose client for [Sublemonable](../../README.md), the
zero-knowledge, end-to-end encrypted ephemeral messenger.

> Nothing lasts. That's the point.

## Requirements

- Android Studio Iguana (2023.2.1) or newer
- JDK 17
- Android SDK 34 (`minSdk` 26 / Android 8.0+)
- No other tooling: no Firebase, no Play Services, no analytics SDKs — by design.

## Build & run

```bash
cd apps/android
# Option A: open the folder in Android Studio and let it sync Gradle.
# Option B: command line (generates the wrapper once, then builds):
gradle wrapper --gradle-version 8.7
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest   # pure-JVM unit tests
```

The Gradle wrapper JAR is intentionally not committed; Android Studio
supplies its own Gradle, or generate the wrapper with the command above.

## Before connecting to a server

Two things are placeholders until you point the app at a real deployment:

1. **API endpoints** — `AppContainer.API_BASE_URL` / `WS_URL` in
   `app/src/main/java/com/sublemonable/app/SublemonableApp.kt`.
2. **Certificate pin** — see below. The app will (correctly) refuse to
   connect until you replace it.

## Certificate pinning — note for self-hosters

`net/CertificatePinning.kt` ships with an **all-zero placeholder pin** that
rejects every certificate. This is deliberate: a privacy app must not fall
back to "any CA-signed cert is fine". Compute your server's pin and replace
both `PRIMARY_PIN` and `BACKUP_PIN`:

```bash
openssl s_client -connect your.host:443 < /dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | base64
```

Always pin a backup key as well, or a routine certificate rotation will lock
your users out. Connections are TLS 1.3 only.

## Screenshots show black. That's a feature.

`MainActivity` sets `WindowManager.LayoutParams.FLAG_SECURE` in `onCreate`,
**before** any content is composed. This is the OS-level hard block: every
screenshot, screen recording, and recent-apps thumbnail of this app renders
black. It is the strongest screenshot protection of all three Sublemonable
platforms and it must be applied to every Activity that can show message
content — this app keeps that trivially true by having exactly one Activity.

Do not "fix" black screenshots. They are the point.

## Security properties of this client

- **Signal Protocol** (X3DH + Double Ratchet) via `org.signal:libsignal-android`
- **Keys never stored in plaintext** — Android Keystore (hardware-backed /
  StrongBox where available) wraps everything persisted through
  `EncryptedSharedPreferences`
- **Decrypted messages live in memory only** — no message database exists
- **Burn-on-read & TTL** enforced locally; the burn animation is a particle
  dissolve, the deletion is real
- **Notifications are content-free** — always "New message",
  `VISIBILITY_SECRET`, nothing on the lock screen
- **No analytics, telemetry, or crash reporting** of any kind; release builds
  strip `android.util.Log` calls defensively
- **`allowBackup="false"`** plus full backup/transfer exclusion rules
- **Permissions**: `INTERNET`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC` — nothing else
- **Root detection** warns (never blocks) via a dismissible banner
- **Optional Tor** routing through Orbot, off by default, Settings → Network

## Fonts

Inter, JetBrains Mono (key fingerprints always render in it) and Space
Grotesk are bundled in `app/src/main/res/font/`. The design spec's display
face is Clash Display with Space Grotesk as fallback; Clash Display's license
(Fontshare ITF FFL) does not permit redistribution in this repo, so the
fallback is bundled. Drop `clash_display_*.ttf` files into `res/font/` and
register them in `ui/theme/Type.kt` to upgrade.

## Project layout

```
app/src/main/java/com/sublemonable/app/
├── MainActivity.kt            FLAG_SECURE + biometric gate + routing
├── SublemonableApp.kt         Application + hand-rolled DI container
├── MessagingCoordinator.kt    crypto <-> transport <-> repositories glue
├── crypto/                    libsignal wrapper, Keystore-encrypted stores
├── net/                       REST client, WebSocket client, cert pinning
├── data/                      envelope (packages/protocol-compatible),
│                              in-memory message/conversation repos, settings
├── security/                  root detection heuristics
├── notifications/             content-free notifications
├── tor/                       Orbot integration
└── ui/
    ├── theme/                 design tokens (dark only)
    ├── components/            LemonSlice + every shared component
    └── screens/               splash, onboarding, chats, settings, verify
```

## License

AGPL-3.0-only — see the repository root [LICENSE](../../LICENSE).
