# Prioritized TODOs

## Next

- [ ] **TODO(ws-open-subproto) — needs explicit approval.** The clearnet/Tor `ws_open`
      command (`transport.rs`) still passes the token via `Sec-WebSocket-Protocol`, which
      tungstenite 0.24 rejects when the server doesn't echo it back (`"Server sent no
      subprotocol"`). Proven transport-independent this session (`examples/ws_subproto_diag.rs`:
      header→FAIL, `?token=`→OK 101). Same one-line fix as `ws_open_i2p` (switch to the
      `?token=` query param). Left unchanged because "do not change existing connection modes"
      was gated — get sign-off, then apply and live-test the clearnet/Tor WS path.
- [ ] **Release keystore off-box pull (pending user).** `~/onion-key-backup/sublemonable-release.jks`
      + `…-info.txt` are staged; scp them off-box and confirm. Not a real backup until pulled.
      Same for `~/onion-key-backup/sublemonable-relay.dat` (I2P dest key) and the three Tor
      `hs_ed25519_secret_key` files staged alongside.
- [ ] **.deb glibc portability.** Release `.deb`s must come from CI (`desktop-linux` job builds
      on ubuntu-22.04 / glibc 2.35). A local build on this host (Ubuntu 26.04 / glibc 2.43) floors
      the binary at GLIBC_2.39 and won't run on debian:bookworm. Not a packaging defect; just
      never ship a locally-built .deb.
- [ ] Clean up the throwaway `i2p-test-client` i2pd container when I2P WS testing is done
      (`docker rm -f i2p-test-client`). It provided the desktop-side proxy on 4444 for the live test.
- [ ] Get `main` reviewed (pushed as `a942173`); decide on TODO(ws-open-subproto) before release.

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
## Done

- [x] (Run 5 / 2026-07-02) **WS-over-I2P live-verified** — `ws_open_i2p` (HTTP CONNECT tunneling
      through i2pd 4444, `type=server` tunnel, 30s timeouts, `?token=` auth). Two authed sessions
      upgraded 101, message round-trip, 60s idle survival, post-idle round-trip.
      `TODO(i2p-ws-verify)` closed; §7 updated. (Follow-up: TODO(ws-open-subproto) for clearnet/Tor.)
- [x] (Run 5) Corrected the i2pd config gotcha — `docker-compose.i2p.yml` now passes
      `--conf/--tunconf`; real server-tunnel dest `y5ac5zowrbpz…b32.i2p` (Run 4's `hgzwylzozn…`
      was the default client-proxy dest, a false positive — corrected in ledger + `.env`).
      `sublemonable-relay.dat` backed up to `~/onion-key-backup/`.
- [x] (Run 5) Android release rebuilt **v1.5.0-beta** (versionCode 2) with `RELAY_ONION_ADDRESS`
      baked in (verified in dex; proguard keeps BuildConfig), signed with release key, staged in
      `onion-site/` with regenerated SHA256SUMS; both mirror pages verified.
- [x] (Run 5) Desktop `.deb` verified in disposable containers — install PASS, launch PASS
      (ubuntu:24.04), Tor-first-by-default PASS at app level (`tor.rs` logs + onion HTTP 200).
- [x] (Run 5) Release keystore verified as the real signing key and staged for off-box pull
      (awaiting user confirmation — see Next).

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
