# Run Ledger

Append one entry per agent run. Do not overwrite prior runs.

## Entry Template

### Run YYYY-MM-DDTHH:MM:SSZ — <agent name>
- **Goal:** What this run attempted.
- **Triggering event:** Event id/type/source, or `none` for normal roadmap work.
- **Reviewer/comment reference:** PR, issue, CI run, reviewer, URL, file/line, or `none`.
- **Decision:** Valid, already fixed, unclear, unsafe, blocked, deferred, stale-lock-recovery, or normal work; include why.
- **Completed work:** What changed or was learned.
- **Fix implemented:** The smallest fix made for the event, or `none` with reason.
- **Changed files:** Files created, modified, deleted, or intentionally left untouched.
- **Tests run / Verification:** One entry per check run, each with `command`, `exit_code`,
  `summary`, `evidence_path` (optional), and `timestamp`. Do not write vague statements like
  "tests passed" without at least `command`, `exit_code`, and `summary`.
- **Response drafted/sent:** Reviewer, issue, or human response status and summary.
- **Event status:** Pending, processing, completed, blocked, deferred, or not applicable.
- **Failures:** Errors, blockers, failed approaches, or skipped checks.
- **Decisions:** Durable decisions made during the run.
- **Confidence:** Low/medium/high plus a short reason.
- **Next action:** The next smallest useful step.
- **Do-not-retry notes:** Failed approaches that should not be repeated unless conditions change.
- **Lock:** `lock_id` acquired/released this run, or `none` if no protected-path write occurred. Note stale-lock reclamation here if applicable.

---

### Run 1 — claude (this session)
- **Goal:** Set up l00prite persistent memory for this already-built repo; make I2P the fixed
  primary relay transport (superseding the earlier `tor_first`/`i2p_first` user-choice model);
  verify/fix `RELAY_ONION_ADDRESS` build injection across web/iOS/Android/desktop; record
  remaining operational deploy steps.
- **Triggering event:** none — direct task instructions, not a PR review comment or CI failure.
- **Reviewer/comment reference:** none for this run, though the RELAY_ONION_ADDRESS iOS xcconfig
  issue and the GitHub-PAT-rotation / keystore-backup TODOs were carried forward from an earlier,
  out-of-band review not present in this checkout.
- **Decision:** Normal work — proceeded directly. `BRIEFING.md` was requested as a source but does
  not exist anywhere in this checkout (`find` came up empty in both the `sublemonable` and
  `l00prite` repos); nothing in this run depended on it, so this did not block anything, but it
  should be flagged to the requester in case the file was meant to be added and wasn't, or the
  reference was simply stale.
- **Completed work:**
  1. Populated `.l00prite/` (blueprint, memory, constraints, failures, todos, heartbeat.json,
     state.json, this ledger) from `sublemonable-MASTER.json`, `README.md`,
     `docs/V1_5_STATUS.md`, `docs/TOR_ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`,
     `docs/SELF_HOSTING.md`, and the code itself — no `/build-loop` clarifying-question flow run.
  2. Made the relay transport hierarchy fixed (I2P primary → Tor fallback → clearnet last
     resort), removing the `PreferredTransport` type / `DEFAULT_PREFERRED_TRANSPORT` and the
     `preferredTransport` setting everywhere it existed: `packages/protocol/src/transport.ts` and
     `connection.ts`, `apps/web/src/lib/transportResolver.ts`, `apps/web/src/App.tsx`,
     `apps/web/src/settings.ts`, `apps/web/src/screens/Settings.tsx` (removed the "Tor
     first/I2P first" selector, kept the clearnet-fallback toggle and the existing read-only
     transport status row, reworded it for the new hierarchy),
     `apps/ios/Sources/Networking/ConnectionMode.swift`, and
     `apps/android/.../data/ConnectionMode.kt`. Updated `CLEARNET_WARNING` copy to the specified
     title/body. Updated `docs/TOR_ARCHITECTURE.md` §6/§7/testing-checklist and
     `docs/SECURITY_MODEL.md` (transport hierarchy section, threat table, ASCII diagram, the
     anonymity-vs-confidentiality independence note) to match. Also corrected `README.md`'s
     "Tor-first" bullet (not explicitly listed in the task, but directly and visibly falsified by
     this change — a one-line, low-risk fix).
  3. Verified `RELAY_ONION_ADDRESS` build injection. Web (`vite.config.ts` / `config.ts`) and
     Android (`build.gradle.kts`) were already correct. **iOS was broken in two ways, not one:**
     `Release.xcconfig` defined `RELAY_ONION_ADDRESS = $(RELAY_ONION_ADDRESS)` (self-referential —
     the prior review's flag was correct), **and** `apps/ios/project.yml` never referenced
     `Configuration/Release.xcconfig` at all via `configFiles`, so XcodeGen would not have applied
     it to any build regardless of what the xcconfig contained. Fixed both: `project.yml` now maps
     `configFiles.Release` to the xcconfig; the xcconfig no longer self-references and documents
     the correct mechanism (export the env var when invoking `xcodebuild`; Xcode surfaces
     unshadowed environment variables as build settings of the same name); `Support/Info.plist`
     gained a `RELAY_ONION_ADDRESS` key wired to `$(RELAY_ONION_ADDRESS)`; new
     `Sources/Networking/RelayConfig.swift` reads it via `Bundle.main.infoDictionary`, matching
     the pattern the file's own comment already documented as the intended design. Desktop's
     `build.rs` injection is mechanically correct (matches what Phase 3 asked to verify) but has
     no Rust consumer anywhere in the source — flagged in `todos.md` rather than silently
     "fixed" with unrequested new routing logic, since desktop's pinned transport deliberately
     never onion-dials directly (see `config.ts`'s `getServerUrl()` comment) and building that out
     wasn't asked for.
  4. Recorded the operational deploy steps (server access, onion address collection, key backups,
     APK rebuild/staging, GitHub PAT rotation, keystore backup) in `todos.md` without attempting
     any of them.
- **Fix implemented:** See "Completed work" above — this run was itself the fix/implementation,
  not a response to a single flagged event.
- **Changed files:**
  - Created: `.l00prite/blueprint.md`, `memory.md`, `constraints.md`, `failures.md`, `todos.md`,
    `heartbeat.json`, `state.json`, this `ledger.md`; `apps/ios/Sources/Networking/RelayConfig.swift`.
  - Modified: `README.md`, `docs/TOR_ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`,
    `packages/protocol/src/transport.ts`, `packages/protocol/src/connection.ts`,
    `apps/web/src/lib/transportResolver.ts`, `apps/web/src/App.tsx`, `apps/web/src/settings.ts`,
    `apps/web/src/screens/Settings.tsx`, `apps/ios/Sources/Networking/ConnectionMode.swift`,
    `apps/ios/Configuration/Release.xcconfig`, `apps/ios/Support/Info.plist`,
    `apps/ios/project.yml`, `apps/android/app/src/main/java/com/sublemonable/app/data/ConnectionMode.kt`.
  - Deliberately untouched: `packages/crypto/vault.ts` and its storage wiring, existing connection
    modes (Standard/Stealth/Ghost) and their bundled config values, certificate pinning, the Tor
    three-hidden-service server infrastructure (`server/cmd/server/onion.go` etc.),
    `sublemonable-MASTER.json` (historical spec document — the supersession is noted in
    `memory.md` instead of editing the frozen spec), `CHANGELOG.md` / `apps/desktop/CHANGELOG.md`
    (historical records — not rewritten retroactively), native iOS/Android Settings *UI* screens
    (`SettingsView.swift` / `SettingsScreen.kt`) since they were never wired to the v1.5 transport
    model in the first place (still pre-v1.5 Orbot toggle) — nothing there referenced the removed
    type, confirmed by grep.
- **Tests run / Verification:**
  - command: `pnpm install --frozen-lockfile`; exit_code: 0; summary: workspace deps installed
    cleanly, lockfile unchanged; timestamp: this session.
  - command: `pnpm build:packages` (`packages/crypto`, `protocol`, `ui`, `relay-client` via
    `tsc`); exit_code: 0; summary: all four packages compiled with no type errors; timestamp:
    this session.
  - command: `pnpm --filter @sublemonable/web typecheck`; exit_code: 0; summary: no type errors
    in the web app after removing `preferredTransport`/`PreferredTransport` and changing
    `resolveTransport`'s signature; timestamp: this session.
  - command: `pnpm -r test`; exit_code: 0; summary: 69/69 tests passed across
    `packages/protocol` (23), `packages/crypto` (26, including the vault timing-parity suite,
    untouched and green), `packages/relay-client` (12), `apps/web` (8, including
    `storage.test.ts`); timestamp: this session.
  - command: `pnpm --filter @sublemonable/web build`; exit_code: 0; summary: production Vite
    build succeeded (pre-existing large-chunk warning only, unrelated to this diff); timestamp:
    this session.
  - command: `pnpm --filter @sublemonable/protocol lint && pnpm --filter @sublemonable/web lint`;
    exit_code: 1 (web only); summary: protocol package Prettier-clean; web app reported 4
    pre-existing formatting warnings (`ScreenshotShield.tsx`, `serialization.ts`, `ChatList.tsx`,
    `VerifyKeys.tsx`) — none of these are files this run touched, and they match the exact set
    already documented as pre-existing in `RUN_LEDGER.md`'s prior entry; timestamp: this session.
  - command: `grep` sweep across the full repo for
    `PreferredTransport|preferredTransport|DEFAULT_PREFERRED_TRANSPORT|tor_first|i2p_first|torFirst|i2pFirst|TOR_FIRST|I2P_FIRST`;
    exit_code: n/a (manual review); summary: zero remaining references outside this ledger's own
    prose and the (intentionally untouched) historical `sublemonable-MASTER.json`; timestamp:
    this session.
  - No Swift/Kotlin compiler or SwiftLint/ktlint available in this environment (no Xcode/Android
    SDK) — iOS and Android changes were verified by careful manual review and by confirming no
    test file (`ConnectionModeTests.swift`, `ConnectionModeTest.kt`) referenced the removed
    `PreferredTransport` type before it was removed.
- **Response drafted/sent:** n/a — no PR/reviewer thread yet for this run.
- **Event status:** not applicable (normal roadmap work, not an event).
- **Failures:** None. The `BRIEFING.md` gap (see Decision) is a documentation-request mismatch,
  not a failure of this run.
- **Decisions:** See `memory.md` for the durable architectural decision (I2P-primary hierarchy)
  and its rationale.
- **Confidence:** High — every code change is covered by an existing green test suite or a
  successful build, and the two iOS bugs (self-reference and missing `configFiles` wiring) were
  independently confirmed by reading `project.yml` directly, not inferred.
- **Next action:** Human review and merge of `claude/l00prite-i2p-relay-setup-kdahma`; see
  `todos.md` for the full operational follow-up list (server deploy, key backups, APK rebuild,
  GitHub PAT rotation, desktop `RELAY_ONION_ADDRESS` consumer decision).
- **Do-not-retry notes:** None yet.
- **Lock:** none — this repo's `.l00prite/` has no `lock.json` (not created this run; only the
  files explicitly requested in Phase 1 were written).
