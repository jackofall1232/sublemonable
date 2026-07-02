# Prioritized TODOs

## Next

- [ ] Get this branch (`claude/l00prite-i2p-relay-setup-kdahma`) reviewed and merged — it contains
      the l00prite memory setup and the I2P-primary transport hierarchy change (see `ledger.md`).

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
- [ ] Live I2P transport (`detectI2P()` is still a stub returning `false` — see `memory.md`; the
      *hierarchy* is now fixed to I2P-primary as of this session, but actual I2P connectivity is
      still unbuilt).

## Done

- [x] (this session) Populated `.l00prite/` memory from existing docs — no fresh `/build-loop`
      scaffolding run.
- [x] (this session) Made I2P the fixed primary relay transport across
      `packages/protocol`, `apps/web`, and the iOS/Android connection-mode data models; updated
      `docs/TOR_ARCHITECTURE.md` and `docs/SECURITY_MODEL.md` to match.
- [x] (this session) Verified `RELAY_ONION_ADDRESS` build injection on web (correct, and
      consumed by `getServerUrl()`) and Android (correct `buildConfigField` wiring); confirmed
      desktop's `build.rs` injection is mechanically correct but currently unconsumed (see
      follow-up above); fixed iOS, which was both self-referential in `Release.xcconfig` *and*
      never wired into the generated Xcode project at all (`project.yml` had no `configFiles`
      entry referencing it) — added `configFiles`, an `Info.plist` key, and
      `RelayConfig.swift`.
