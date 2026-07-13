# Project Memory

Durable project facts and decisions that future agents should preserve. Sourced from
`sublemonable-MASTER.json`, `docs/TOR_ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, and the actual
code — not speculative.

## Decisions

- **Three-onion-service architecture.** The server runs three separate Tor v3 hidden services on
  one box, sharing one Go binary and one internal port, distinguished by the request `Host`
  header (`server/cmd/server/onion.go`): a **public download mirror** (published, static no-JS APK
  page), a **secret resilience mirror** (unpublished, word-of-mouth, identical content, survives a
  takedown of the public address), and a **relay onion** (unpublished, baked into the app binary,
  API only — no mirror, so an observer watching both onions can't correlate messaging with
  download traffic). See `docs/TOR_ARCHITECTURE.md` §2.
- **Relay transport hierarchy is fixed, not user-selectable: I2P (primary) → Tor (fallback) →
  clearnet (last resort, always warned).** This supersedes the earlier v1.5 `tor_first`/`i2p_first`
  user-choice model. I2P's unidirectional inbound/outbound tunnels require an adversary to
  compromise two independently-built paths for timing correlation, a stronger fit for relay
  traffic than Tor's bidirectional circuits; Tor remains the fallback for its larger anonymity
  set. Download/mirror transport is unchanged: Tor onion primary, clearnet fallback. (Changed in
  this session — see `ledger.md`.)
- **`HiddenServiceNonAnonymousMode` is never set.** Every hidden service is an ordinary, fully
  anonymous v3 hidden service — no exceptions, no single-hop mode. `docs/TOR_ARCHITECTURE.md` §1.
- **No `Onion-Location` header, anywhere, ever.** Deliberate: it would auto-advertise an onion
  address to clearnet visitors, and the project never wants to auto-discover the secret mirror —
  so the header isn't added even for the public mirror, to keep behavior uniform and the secret
  mirror un-leakable. `docs/TOR_ARCHITECTURE.md` §9.
- **Relay node self-hosting is opt-in via `RELAY_PRIVATE_KEY` / `RELAY_PUBLIC_KEY`.** Setting
  *both* env vars (base64 Curve25519 keypair) turns a plain message server into a multi-hop relay
  node serving `POST /relay/forward`; leaving them empty runs a plain server.
  `RELAY_PEERS` (comma-separated allowlist of next-hop forward URLs) is required for forwarding to
  work — it fails closed (empty) as an SSRF guard, since the next hop is chosen by whoever sealed
  the packet to this relay's public key. `server/internal/config/config.go`,
  `server/.env.example`.
- **Post-quantum crypto (PQC) is deferred, not active in v1.** libsignal's `KyberPreKeyStore`
  interface is implemented on iOS and Android (required by the store interface), but Sublemonable
  v1 prekey bundles are Curve25519-only — Kyber records only appear "if a future server adds
  Kyber bundles" (`apps/ios/Sources/Crypto/SignalManager.swift`,
  `apps/android/.../crypto/EncryptedSignalProtocolStore.kt`). Treat PQC as unimplemented until a
  server-side Kyber bundle change lands.
- **No TLS over onion services.** The v3 `.onion` address's ed25519 key *is* the cryptographic
  identity; certificate pinning applies only to clearnet connections. `docs/TOR_ARCHITECTURE.md`
  §4.
- **Zero-knowledge server, by construction.** The server stores only UUIDs, public keys/prekeys,
  opaque encrypted envelopes, and a delivery-receipt hash — never plaintext, IP addresses, device
  identifiers, contact lists, or identity-linked read receipts. Envelopes are deleted immediately
  on delivery ack; undelivered envelopes purge after 72h.
- **AGPL-3.0-only license.** Anyone running a modified Sublemonable as a service must open-source
  their changes. Every source file carries an AGPL-3.0 header (`CONTRIBUTING.md`).

## Facts

- Connection modes (`packages/protocol/src/connection.ts`) are fixed bundles, not
  freely-composable settings: **Standard** (1 relay hop, no decoy, no dead-drop), **Stealth** (3
  hops, medium decoy), **Ghost** (3 hops, high decoy, every message is a dead drop).
- The desktop app is the `apps/web` bundle running inside a Tauri WebView; it has no separate
  Settings UI of its own — native Rust only handles pinned transport, keystore, and screenshot
  protection, not UI.
- Native iOS/Android Settings screens (`SettingsView.swift`, `SettingsScreen.kt`) are still on the
  pre-v1.5 Orbot opt-in Tor model — they have never been wired to the v1.5
  `ConnectionMode`/transport types. Building that native v1.5 UI is separately-tracked,
  not-yet-done work (see `docs/V1_5_STATUS.md`), not something to infer as already shipped.
- `docker-compose.tor.yml` is an overlay on top of `docker-compose.yml` — the Tor hidden services
  are optional, not required to run the server.
- **Contact-add uses `ContactExchangePayload`, NOT the dead-drop token.** Adding a contact by
  QR/link across every client is the JSON `{"version":"1","account_id":"<uuid>",
  "identity_key":"<base64>"}` — iOS `ConversationStore.ContactExchangePayload` +
  `SignalManager.contactExchangePayload()`, the web/Android parsers, and Android's
  `ui/components/ContactExchange.kt` (`buildContactExchangePayload`/`parseContactInput`, pinned
  by `ContactInputParserTest`/`ContactExchangeTest`). The **dead-drop token** (256-bit,
  `packages/crypto/deaddrop.ts`) is a separate single-use anonymous *messaging* capability for
  Ghost mode — it carries no durable identity and must never be used for contact discovery.
- **Android relay transport is Orbot-opt-in Tor or clearnet — no in-process I2P/Tor.** The fixed
  I2P→Tor→clearnet hierarchy is the protocol posture, but on mobile I2P is an honest stub and
  Tor is Orbot-only, so Android's real universe is clearnet (default) or Tor-over-Orbot-SOCKS
  when the (pre-existing, pre-v1.5) toggle is on. As of the 2026-07 UI-wiring pass the Android
  boot is a single-flight, backoff-retrying supervisor in `MessagingCoordinator.start()`
  (registration + session + socket come up automatically, `onAuthExpired` re-sessions on a dead
  JWT), and `SettingsScreen` surfaces the active transport with clearnet always flagged. Do not
  reintroduce the old one-shot blanket-`runCatching` boot with no retry.
- Watermarking (web screenshot leak attribution) embeds **both** conversation parties' account
  UUIDs per conversation view — a deliberate, documented tradeoff against the project's own
  metadata-minimization goals (`docs/SECURITY_MODEL.md` §"Watermark tradeoff").

## Avoid

- Do not store random temporary notes, speculative ideas, or stale debugging output here.
- Do not record anything about `packages/crypto/vault.ts` internals here as if it were open for
  casual edits — see `constraints.md`.
