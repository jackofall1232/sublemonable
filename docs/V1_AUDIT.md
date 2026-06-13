# v1.0 Audit — spec conformance pass

This is the "soft audit" pass requested alongside the v1.5 build: a comparison of the **shipped v1.0
code** against `sublemonable-MASTER.json`. It is a conformance/architecture review, **not** a
third-party security audit (that record lives in [AUDIT.md](../AUDIT.md)).

Verdict: **v1.0 closely matches the master spec.** The architecture, crypto, server, packages, web
client, and design system are all present and faithful. The findings below are the gaps and
mismatches found, with the action taken.

## Findings

### 1. `privacy_view_mode` was specified under v1.0 but not built — FIXED

`versions.1.0.0.features.privacy_view_mode` is a full feature in the master file, but no privacy
view existed anywhere in the repo. Built in v1.5 work: `PrivacyView` in `packages/ui` (frosted-lemon
overlay, hold / tap-timed / tap-toggle reveal modes) and wired into the web `ChatView` and Settings,
with shared logic/types in `packages/protocol` (`privacy.ts`).

### 2. `platform_warning_system` was specified under v1.0 but not built — FIXED

Likewise specified in `versions.1.0.0.features.platform_warning_system` and entirely absent. Built:
`PlatformWarningBadge` in `packages/ui`, `platformWarning()` logic in `packages/protocol`, and an
encrypted `contact.info` signal (events + ws relay) for the real-time platform exchange the spec
calls for. The web client shows the honest "you're on browser" warning.

### 3. Argon2id `parallelism` differs from the spec (1 vs 4 on web) — DOCUMENTED, not a regression

The spec asks for `parallelism: 4`. `libsodium.js` `crypto_pwhash` uses `parallelism = 1` internally
and exposes no lane parameter, so the web client cannot honor the value literally. This is already
called out in a code comment in `packages/crypto/kdf.ts`. It is consistent across all web derivations
(so the v1.5 timing-parity guarantee is unaffected) and the native clients can use the spec value.
**Recommendation:** note the platform difference in `SECURITY_MODEL.md`'s key-storage section.

### 4. Web "certificate pinning" is described imprecisely in `SECURITY_MODEL.md` — MINOR

`docs/SECURITY_MODEL.md` (v1.0 text) lists web transport as "Service Worker intercept with HPKP-style
validation". The master spec is more honest: true certificate pinning is **not** available in
browsers (HPKP was removed; Service Workers cannot see the TLS chain), and web relies on CA
validation + HSTS preload. The code does not attempt false pinning, so this is a docs wording issue,
not a code defect. **Recommendation:** align the web row of the transport-security table with the
master's `certificate_pinning.web` note.

### 5. Server Go version: spec says 1.22+, repo targets 1.25 — ACCEPTABLE

`go.mod` and the README use a newer Go than the spec floor. Newer is fine and not a violation; noted
only for completeness.

### 6. `apps/web` is not Prettier-clean — PRE-EXISTING, MINOR

`pnpm --filter @sublemonable/web lint` reports formatting issues in several pre-existing `apps/web`
source files (e.g. `store.ts`, `screens/*`). These predate the v1.5 work. Files touched during v1.5
were formatted; the remaining v1 files should be run through `prettier --write` in a cleanup pass.

## Confirmed conformant (spot checks)

- **Zero-knowledge server**: stores only public keys, opaque envelopes, and token/message-ID hashes;
  no IPs, no device IDs, no plaintext. Envelopes deleted on delivery ack; janitor purges past TTL.
- **Crypto package** exports match `packages.crypto.exports` (X3DH, Double Ratchet, Argon2id KDF,
  AES-256-GCM keystore, invisible watermark).
- **Message envelope** schema matches `packages.protocol.message_envelope_schema` field-for-field.
- **Auth**: Ed25519 challenge login, JWT access tokens, refresh tokens hashed at rest and rotated on
  every use, parameterized SQL throughout.
- **Design system**: dark-only tokens, lemon `#F5E642` owns interactivity, no white backgrounds,
  Clash Display / Inter / JetBrains Mono — all per `design_system.tokens`. No `DM Serif Display`.
- **Rate limits**, security headers, and the `LemonSlice` signature element are all present.
