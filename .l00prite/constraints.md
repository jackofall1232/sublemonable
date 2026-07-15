# Constraints

Hard rules, user preferences, security boundaries, and architecture constraints for the
Sublemonable repo.

## Hard Rules

- **Never touch `packages/crypto/vault.ts` or its storage wiring without explicit sign-off.**
  This is the plausible-deniability key-slot vault crypto — timing-parity tested, currently green.
  A silent behavioral change here can quietly weaken deniability while still "working" (see
  `docs/V1_5_STATUS.md`'s own warning about this file). Storage wiring includes
  `apps/web/src/lib/storage.ts`, `apps/web/src/store.ts`, and the Tauri `keystore.rs` backends
  that persist vault images.
- **Never weaken encryption defaults.** No downgrading Argon2id parameters, AES-256-GCM, X3DH/
  Double Ratchet usage, or TLS 1.3 minimums, and no adding an opt-out for any of them.
- **Never add logging, telemetry, or crash reporting.** Server-side message logging of any kind
  is also forbidden. `CONTRIBUTING.md` hard rule — PRs that violate this are closed regardless of
  code quality.
- **Never store user-identifiable metadata** (IP addresses, device identifiers, contact lists,
  identity-linked read receipts) — server or client.
- **Follow `CONTRIBUTING.md` hard rules** for any change: bug fixes/security/perf/docs/
  translations/new-platform-support are welcome; cryptography changes require a detailed
  explanation reviewed by a maintainer.
- **AGPL-3.0 header required on every new source file** — copy the existing header block from a
  neighboring file in the same language/directory.
- **Never touch existing connection modes (Standard/Stealth/Ghost), certificate pinning, or the
  Tor three-hidden-service infrastructure** without an explicit task asking for exactly that
  change — these are load-bearing security/anonymity properties, not incidental code.
- **`HiddenServiceNonAnonymousMode` must never be set**, and **no `Onion-Location` header may ever
  be emitted** — both are deliberate, documented non-negotiables (`docs/TOR_ARCHITECTURE.md` §9).
- Scaffolding/memory tooling generates or edits files only; it does not execute deploys, key
  generation, or server access. Every implementation loop should update `.l00prite/` memory
  before stopping.
- **Never run a bare `docker compose ...` command against the `server` service on the production
  box — always `-f docker-compose.yml -f docker-compose.tor.yml -f docker-compose.i2p.yml`.** The
  overlays don't just add the `tor`/`i2p` containers; they merge additional required environment
  (`PUBLIC_ONION_ADDRESS`, `SECRET_ONION_ADDRESS`, `RELAY_ONION_ADDRESS`, `ONION_SITE_DIR`,
  `I2P_ENABLED`, `I2P_EEPSITE_DEST`) directly into the base `server` service definition. A bare
  `docker compose up -d server` silently recreates the container with that config missing — no
  error, no warning about the missing env (only an easy-to-dismiss "orphan containers" notice about
  `tor`/`i2p`) — and breaks the onion mirror's Host-based routing while the API on 8443 keeps
  working fine, so it's easy to ship and not notice. This happened for real in `.l00prite/ledger.md`
  Run 14/15 — caused and then fixed within the same investigation.

## User Preferences

- Prefer the smallest correct diff — this is a mature, already-implemented, well-documented
  codebase, not a fresh scaffold. Read the relevant doc (`docs/SECURITY_MODEL.md`,
  `docs/TOR_ARCHITECTURE.md`, `docs/SELF_HOSTING.md`) before changing behavior it describes, and
  update the doc in the same change if the behavior changes.
- One logical change per commit, with a message describing what changed and what was verified.
- Do not run the `/build-loop` clarifying-question flow against this repo — it is not a new
  project.

## Security Boundaries

- Real secrets (`hs_ed25519_secret_key` files, the `.jks` release keystore, JWT signing keys,
  `RELAY_PRIVATE_KEY`, GitHub PATs) are never generated, committed, or handled by an agent in this
  repo — those are operator/human steps performed outside the coding session (see `todos.md`).
- `RELAY_ONION_ADDRESS`, `SECRET_ONION_ADDRESS`, and any other unpublished `.onion` address must
  never be written into a template, doc, or default value — only the public mirror address is
  ever meant to be publishable, and only by the operator, not by this repo's source.
- Release artifacts (`.apk`, `.aab`, keystores) are `.gitignore`d and must never be committed;
  `onion-site/` is staged manually by the operator.

## Architecture Constraints

- Monorepo, pnpm workspaces; keep `packages/protocol` types in lockstep with the Swift
  (`ConnectionMode.swift`) and Kotlin (`ConnectionMode.kt`) mirrors — the in-file comments on both
  say "MUST stay in lockstep," and that is an active invariant, not decoration.
- The desktop app has no independent Settings UI — it reuses `apps/web`'s. Do not create a
  parallel desktop-only settings screen; change `apps/web/src/screens/Settings.tsx` instead.
- Any change to the relay transport fallback chain must keep the download/mirror transport
  (Tor onion primary, clearnet fallback) untouched — the two chains are independent by design.
- `docs/TOR_ARCHITECTURE.md` is the authoritative reference for Tor/onion behavior; if code and
  doc disagree, that is a bug in one of them, not a judgment call to make silently.
