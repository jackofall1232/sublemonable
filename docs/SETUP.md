# Development Setup

## Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 9 (`corepack enable`)
- **Go** ≥ 1.25
- **PostgreSQL** 16 (or Docker)
- **Xcode** 15+ with iOS 16 SDK (iOS app only)
- **Android Studio** Hedgehog+ with SDK 34 (Android app only)
- `openssl` for generating JWT signing keys

### Linux desktop app (apps/desktop)

The Tauri v2 desktop app additionally requires:

- **Rust** stable (rustup recommended) and the Tauri CLI (`cargo install tauri-cli --version '^2'`)
- `libwebkit2gtk-4.1-dev`, `libsecret-1-dev`, `libgtk-3-dev`, `librsvg2-dev`, and `patchelf` (for
  the AppImage bundle)

On Debian / Ubuntu / Kali:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libsecret-1-dev libgtk-3-dev librsvg2-dev patchelf
```

## Clone and install

```bash
git clone https://github.com/jackofall1232/sublemonable.git
cd sublemonable
pnpm install
pnpm build:packages   # builds packages/protocol, packages/crypto, packages/ui
```

## Environment variables

The server reads its configuration from the environment. Copy the example and edit:

```bash
cp server/.env.example server/.env
```

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://sub:sub@localhost:5432/sublemonable?sslmode=disable` |
| `JWT_PRIVATE_KEY_PATH` | RS256 private key (PEM) | `./keys/jwt.pem` |
| `JWT_PUBLIC_KEY_PATH` | RS256 public key (PEM) | `./keys/jwt.pub.pem` |
| `SERVER_PORT` | Listen port | `8443` |
| `TLS_CERT_PATH` | TLS certificate (empty = plain HTTP behind a proxy) | `./certs/fullchain.pem` |
| `TLS_KEY_PATH` | TLS private key | `./certs/privkey.pem` |
| `MAX_PREKEYS_PER_USER` | One-time prekey cap | `100` |
| `MESSAGE_TTL_UNDELIVERED_HOURS` | Purge undelivered envelopes after | `72` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` |
| `TOR_ENABLED` | Advertise onion address | `false` |

Generate JWT keys:

```bash
mkdir -p server/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out server/keys/jwt.pem
openssl rsa -in server/keys/jwt.pem -pubout -out server/keys/jwt.pub.pem
```

## Run the server

```bash
docker compose up -d postgres          # or point DATABASE_URL at your own PG 16
cd server
go run ./cmd/server                    # applies migrations on boot
```

## Run the web app

```bash
pnpm dev:web                           # http://localhost:5173
```

Set `VITE_SERVER_URL` in `apps/web/.env` if the server isn't on `localhost:8443`.

## Run the iOS simulator

```bash
cd apps/ios
xcodegen generate                      # project.yml → Sublemonable.xcodeproj
open Sublemonable.xcodeproj            # ⌘R on an iOS 16+ simulator
```

## Run the Android emulator

```bash
cd apps/android
./gradlew :app:installDebug            # or open in Android Studio and Run
```

Note: `FLAG_SECURE` means screenshots of the emulator's message screens show black — that's the
feature working.

## Run tests

```bash
pnpm test                              # Vitest — packages + web
cd server && go test ./...             # Go server tests
cd apps/android && ./gradlew test      # JUnit
# iOS: ⌘U in Xcode, or: xcodebuild test -scheme Sublemonable -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Run the Linux desktop app

```bash
cd apps/desktop
cargo tauri dev    # opens Tauri window backed by apps/web dev server

# Or build release packages:
cargo tauri build --bundles deb,appimage,rpm
# Output: src-tauri/target/release/bundle/{deb,appimage,rpm}/

# For Tor routing during dev:
torsocks cargo tauri dev
# Or: ALL_PROXY=socks5h://127.0.0.1:9050 cargo tauri dev
```
