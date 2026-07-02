# Prioritized TODOs

## Next

- [ ] Bring up the I2P overlay and read the relay B32 destination (see `docker-compose.i2p.yml`
      and `docs/SELF_HOSTING.md` §"Optional I2P relay transport"):
      `docker compose -f docker-compose.yml -f docker-compose.i2p.yml up -d`
      then `curl -s 'http://127.0.0.1:7070/?page=i2p_tunnels' | grep -oP '[a-z2-7]+\.b32\.i2p' | head -1`
- [ ] Set `I2P_ENABLED=true`, `I2P_EEPSITE_DEST=<b32>` in `.env`; restart server with
      `docker compose -f docker-compose.yml -f docker-compose.i2p.yml up -d server`.
- [ ] Build desktop with `RELAY_I2P_DEST=<b32>` set: `export RELAY_I2P_DEST=<b32> && pnpm tauri build`.
- [ ] Back up `i2p-data` volume (specifically `sublemonable-relay.dat`) alongside the Tor hidden
      service keys and JWT keys — see `docs/SELF_HOSTING.md` §"Back up your I2P destination key".
- [ ] Empirically verify REST routing over I2P on desktop: with i2pd running and `RELAY_I2P_DEST`
      set, confirm the app routes REST calls through `i2p_request` and receives valid API responses.
- [ ] Investigate `TODO(i2p-ws-verify)` in `i2p.rs` — test WebSocket upgrade through i2pd HTTP
      proxy to a `.b32.i2p` destination. If i2pd's HTTP proxy does not support CONNECT for WS
      upgrade, document alternative (SAM bridge or tokio HTTP CONNECT implementation) and flag
      to operator before declaring WS-over-I2P done.
- [ ] Get this branch reviewed and merged.

## Later — operational deploy steps (require server/build access outside a coding session)

These are recorded here so they are not lost, and deliberately **not attempted** by an agent —
they need real infrastructure access, signing keys, and a human decision point:

- [ ] Merge this branch once reviewed.
- [ ] SSH into the Hetzner box and bring up the Tor overlay:
      `docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d`.
- [ ] Read all three `.onion` hostnames (public mirror, secret mirror, relay) — see
      `docs/SELF_HOSTING.md` §"Read your addresses".
- [ ] Set `PUBLIC_ONION_ADDRESS`, `SECRET_ONION_ADDRESS`, `RELAY_ONION_ADDRESS`, `TOR_ENABLED=true`
      in the server `.env`.
- [ ] Back up all three `hs_ed25519_secret_key` files **offline**, alongside the `.jks` release
      keystore and the JWT signing keys. Losing any of them is permanent
      (`docs/TOR_ARCHITECTURE.md` §5).
- [ ] Rebuild the Android APK with `RELAY_ONION_ADDRESS` baked in
      (`apps/android/app/build.gradle.kts` → `buildConfigField`).
- [ ] Stage the rebuilt APK + `SHA256SUMS` into `onion-site/` (never committed — see
      `docs/SELF_HOSTING.md` §"Stage the APK").
- [ ] Restart the server and run through the full `docs/TOR_ARCHITECTURE.md` §10 testing
      checklist (updated this session for the fixed I2P→Tor→clearnet chain — re-verify against
      the new checklist wording, not the old "toggle I2P first" item).
- [ ] GitHub PAT rotation — flagged in an earlier review, still outstanding. Not documented
      elsewhere in this repo; carried forward here per explicit instruction.
- [ ] Release keystore offline backup — flagged in an earlier review, still outstanding. Same
      caveat: not documented elsewhere in this repo, carried forward per explicit instruction.

## Later — build-injection follow-up found this session

- [ ] `apps/desktop/src-tauri/build.rs` correctly bakes `RELAY_ONION_ADDRESS` in via
      `cargo:rustc-env`, matching what Phase 3 asked to verify, but **nothing in the desktop Rust
      source currently reads `env!("RELAY_ONION_ADDRESS")`** (grepped — zero matches outside
      `build.rs` itself). This wasn't in scope to fix this session (desktop's pinned transport
      deliberately never onion-dials directly — see `apps/web/src/config.ts`'s `getServerUrl()`
      comment — so there may be no runtime need for it), but flagging so a human decides whether
      desktop needs equivalent onion-dial wiring or whether the injection is intentionally inert
      today.

## Later — known gaps from `docs/V1_5_STATUS.md` (not in scope for this session)

- [ ] In-process Tor on iOS/Android (`Tor.framework` / `tor-android`) — currently Orbot opt-in
      only.
- [ ] Native v1.5 Settings UI (connection-mode selector, privacy-view rendering, dead-drop QR,
      second-passphrase setup) on iOS/Android — the v1.5 data models exist but have no native UI
      consumer yet.
- [ ] Background decoy tasks (iOS `BGProcessingTask`, Android `WorkManager`, web Service Worker).
- [ ] QR generation/scanning for dead-drop token exchange (currently copy/paste token only).
- [ ] **In-process I2P on mobile** (iOS/Android) — no production I2P router SDK exists for
      in-process embedding; requires same class of SDK work as Guardian Project's `Tor.framework`/
      `tor-android`. `detectI2P()` is an honest stub on mobile; the chain falls correctly to Tor.
      Do NOT mark as done until a real SDK is embedded. See `docs/V1_5_STATUS.md`.
- [ ] **WS-over-I2P** (`TODO(i2p-ws-verify)` in `apps/desktop/src-tauri/src/i2p.rs`) — requires
      empirical testing on a live I2P network. `i2p_request` (REST) is the confirmed-working path.
      Do NOT mark as done without live verification.

## Done

- [x] (Run 1) Populated `.l00prite/` memory from existing docs — no fresh `/build-loop`
      scaffolding run.
- [x] (Run 1) Made I2P the fixed primary relay transport across
      `packages/protocol`, `apps/web`, and the iOS/Android connection-mode data models; updated
      `docs/TOR_ARCHITECTURE.md` and `docs/SECURITY_MODEL.md` to match.
- [x] (Run 1) Verified `RELAY_ONION_ADDRESS` build injection on web and Android; fixed iOS
      `Release.xcconfig` self-reference and missing `project.yml` `configFiles` wiring.
- [x] (Run 4 / 2026-07-02) Made I2P a real relay transport on **server and Linux desktop**:
      `docker-compose.i2p.yml`, i2pd server tunnel config, `GET /healthz` endpoint,
      `RELAY_I2P_DEST` build injection, `i2p.rs` module (`I2pHttp`, `check_i2p_connectivity`,
      `i2p_request`), startup probe (I2P before Tor in `lib.rs`), `detectI2P(isTauriApp)` Tauri
      branch in `transportResolver.ts`, `i2pRequest()` in `nativeTransport.ts`, updated
      `pinning.rs` ENFORCEMENT STATUS comment. Docs updated: `TOR_ARCHITECTURE.md` §7,
      `V1_5_STATUS.md`, `SECURITY_MODEL.md`, `SELF_HOSTING.md`, `server/.env.example`.
      Mobile and browser I2P remain honest stubs. WS-over-I2P explicitly unverified.
