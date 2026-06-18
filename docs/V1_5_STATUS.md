# v1.5 implementation status

This tracks the v1.5 ("security onion") build against `sublemonable-MASTER.json` — what is built and
verified, and what remains. It follows the master's `versions.1.5.0.build_order`.

## Built and verified (tests passing)

| Area | Where | Verification |
| --- | --- | --- |
| Key-slot vault crypto (plausible deniability) | `packages/crypto/vault.ts` | Unit tests incl. **timing-parity** (every slot derived, no early exit), slot-count non-disclosure, vault isolation |
| 256-byte message padding | `packages/crypto/padding.ts` | Round-trip + length-hiding tests |
| Dead-drop tokens + hashcash PoW | `packages/crypto/deaddrop.ts` | Solve/verify + leading-zero-bit tests |
| 3-layer onion encryption | `packages/crypto/onion.ts` | 3-hop peel + wrong-key rejection tests |
| Connection modes / decoy cadence / privacy / platform logic | `packages/protocol` | Mode-escalation, platform-warning, privacy-override tests |
| Decoy scheduler (Poisson) + circuit construction | `packages/relay-client` | Poisson, AS/region diversity, rotation, guard-pinning, battery back-off tests |
| Dead-drop endpoints (deposit/redeem) + PoW verify | `server/internal/api/drops.go`, `internal/pow` | PoW round-trip test; replay/expiry semantics via single-use delete |
| Multi-hop relay forward (onion peel) | `server/internal/relay`, `api/relay.go` | 3-hop peel + wrong-key tests (nacl/box, wire-compatible with client) |
| Drops table + janitor purge; envelope-FK fix | `server/internal/db` | builds; see V1_AUDIT finding #6 |
| Connection-mode badge, privacy view, platform warning, dead-drop create/redeem | `packages/ui`, `apps/web` | typecheck + production build |
| lemon-ui reconciliation (wheel fill, typing drops, squeeze send, lemon drop) | `packages/ui` | typecheck + build |
| Native connection-mode / privacy-view logic models | `apps/ios`, `apps/android` | JUnit / XCTest (logic only) |

## Remaining (depends on platform SDKs or full-client e2e not available in this environment)

- **In-process Tor** (`Tor.framework` on iOS, `tor-android` on Android). The Tor-first *model* and
  badge exist; embedding the Tor binaries requires the Guardian Project libraries and a device/SDK
  build. Web Tor works today via the Tor Browser + `.onion` host (already detected).
- **Web multi-vault storage wiring.** The vault crypto (`packages/crypto/vault.ts`) is complete and
  timing-parity tested. Wiring it into `apps/web` `lib/storage.ts` + the unlock/setup flow was
  deliberately *not* shipped half-finished: correct plausible-deniability storage requires every
  slot's encrypted blob to be size-indistinguishable from filler (so vault count can't be inferred
  from IndexedDB), and an incorrect sizing policy would silently weaken deniability while appearing
  to work. This is the one place where shipping a partial implementation is worse than none. It
  should be implemented as a fixed-size, padded per-slot blob store with an explicit max, plus an
  end-to-end unlock test, before being enabled. **Decision (KDF cost):** the per-slot Argon2id design
  is kept for maximal isolation; the unlock must run off the main thread. The Web Worker wrapper is
  in place (`apps/web/src/lib/vaultWorker.ts` + `vault.worker.ts`) and the future unlock flow should
  call `unlockVaultOffThread`; iOS/Android must run the equivalent on a background queue/coroutine.
- **Native v1.5 UI** (connection-mode selector, privacy-view rendering, dead-drop QR, second-
  passphrase setup) and **forensic protections** (SQLCipher WAL handling, secure delete, timestamp
  normalization) — platform-specific, and the native projects can't be compiled in this environment.
- **Background decoy tasks** (iOS `BGProcessingTask`, Android `WorkManager`, web Service Worker
  background sync). The decoy *generator* and scheduler are done and used by the web app in the
  foreground; backgrounding is platform plumbing.
- **QR generation/scanning** for dead-drop token exchange. The web client currently shows the token
  string to copy/share; a QR encoder/decoder is the intended out-of-band transport.
