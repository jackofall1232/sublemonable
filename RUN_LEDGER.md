# RUN LEDGER — multi-vault storage migration

Branch: `claude/multi-vault-storage-migration-qv5my0`
Scope: migrate `apps/web/src/lib/storage.ts` from the single-blob keystore to the
multi-vault plausible-deniability model, and wire `apps/web/src/store.ts` through it.

## What changed

### `apps/web/src/lib/storage.ts` — rewritten

Single-blob `{salt, blob}` record replaced by a fixed-size **disk image** stored
whole under ONE IndexedDB key (`image` in the `vault` store), or passed as one
opaque blob to the Tauri keystore adapter:

```
version(1) ‖ SLOT_COUNT × [salt(16) ‖ wrapped key(60)] ‖ SLOT_COUNT × payload(256 KiB)
= 1,048,881 bytes, a compile-time constant regardless of vault count
```

- **Fixed-size padded per-slot payloads.** A real payload is the vault's keystore
  JSON padded to the region's full plaintext capacity and _then_ AES-256-GCM
  encrypted under the vault key (pad-then-encrypt — the length prefix lives inside
  the ciphertext; padding after encryption would have put a plaintext length field
  on disk and statistically distinguished real slots from filler, leaking the count).
  A filler payload is uniform CSPRNG output. Real and filler are byte-for-byte
  indistinguishable and identically sized.
- **Interface:** `hasVault` / `createVault` / `unlockVault` / `persistVault` /
  `destroyVaultSlot` (turns the slot back into filler; the image never shrinks) /
  `destroyVaultImage` (panic wipe). Pure image codec (`encodeImage` / `decodeImage`
  / `sealPayload` / `openPayload` / `randomPayload`) exported for tests.
- **Unlock goes through `unlockVaultOffThread`** (Web Worker → `tryPassphrase`),
  preserving the vault.ts timing-parity contract: every slot derived and tried, no
  early exit. Because every payload region is the same size, opening vault A costs
  the same work as opening vault B.
- **No single-blob fallback.** IDB v1→v2 upgrade deletes the legacy `keystore`
  record; anything that isn't exactly a current-version image (e.g. a stale legacy
  Tauri blob) is treated as absent, never parsed.
- **Bulk randomness** (payload padding fill, filler regions) drawn from
  `crypto.getRandomValues` chunked at the 64 KiB quota — libsodium.js's WASM
  `randombytes_buf` measured ~650 ms per 256 KiB, which would have taxed every
  per-message persist by >1 s. The fill sits inside AEAD plaintext (or is itself
  the stored randomness), so the entropy source swap has no distinguishability
  impact.
- **Concurrency:** all image mutations (`createVault` / `persistVault` /
  `destroyVaultSlot` / `destroyVaultImage`) serialize through a promise-chain
  lock within the realm plus a Web Lock (`navigator.locks`) across tabs, and
  there is NO in-memory image cache — every operation reads the backend fresh.
  This closes three real bugs review surfaced: an in-flight persist
  interleaving with a destroy could have written a pre-destroy slot table back
  to disk (resurrecting a "destroyed" vault); a failed backend write could
  have left memory claiming state the disk didn't have; and two tabs holding
  different vaults could have clobbered each other's payload regions through
  unserialized whole-image read-modify-write. `lock()` retires the vault key
  through the same queue (`retireVaultSession`) so wiping never drops an
  in-flight persist whose side effects already happened.
- **Hardening:** `sealPayload` refuses an all-zero (wiped) vault key — checked
  both before AND after the encrypt, closing the TOCTOU window — so a `lock()`
  racing an in-flight `persist()` fails loudly instead of silently sealing the
  keystore under a dead key (permanent vault loss). `unlockVault` wipes the
  unlocked key if the payload fails to open. On desktop, a stale
  pre-migration single-blob keystore is treated as absent and never parsed,
  but deliberately NOT blind-purged from the web layer: `delete_vault` clears
  BOTH Rust backends, so purging an invalid Secret Service blob could destroy
  a valid image in the file fallback (Codex review, P1). A safe purge needs a
  per-backend delete on the Rust side — logged as a desktop follow-up; the
  stale blob is overwritten naturally on the next vault creation.

### `apps/web/src/store.ts` — rewired

- `deriveKeyFromPassword` / `generateSalt` / `encryptKeyStore` / `decryptKeyStore`
  imports **removed entirely**; state fields `masterKey`/`salt` replaced by
  `vault: VaultSession {vaultKey, slotIndex}`.
- `bootstrap` → `hasVault()`; `createAccount` → `createVault()` (one Argon2id via
  `sealSlot`); `unlock` → `unlockVault()` (worker path; null = wrong passphrase);
  `persist` → `persistVault()`; `deleteAccount` → `destroyVaultSlot()` (other
  vaults untouched); `lock` wipes the vault key.
- `unlock()` no longer reports a post-unlock login/network failure as
  "Wrong passphrase": the vault key is wiped, state is cleared, and an honest
  "server unreachable" error is shown. A corrupt payload still reads as a wrong
  passphrase — a clobbered vault must stay indistinguishable from a bad guess.
- New `resetDevice()` action + an always-present, two-step "Reset this device"
  escape hatch on the unlock gate (`Gate.tsx`). Without it, `deleteAccount`
  followed by a page reload stranded the user forever: the image still exists
  (the slot became filler), bootstrap routes to "unlock", and no passphrase can
  open an all-filler image — by design nothing stored can reveal that. The
  reset erases the whole image (every vault) behind an explicit confirm.

### `docs/SECURITY_MODEL.md`

- Web storage bullet updated to the multi-vault image.
- Plausible-deniability section: on-disk image layout + two VeraCrypt-analogous
  caveats accepted deliberately (multi-snapshot diffing; blind overwrite when
  creating a new vault into an existing image), and an honest note on the one
  timing residue (post-decrypt JSON parsing scales with vault contents —
  milliseconds against seconds of fixed KDF work).
- **Watermark tradeoff documented** (per DoD), and documented _truthfully_: the
  audit caught that `ChatView.tsx:71` passes the conversation **peer's UUID**
  into the watermark's messageId field, so a lossless capture exposes BOTH
  parties' account UUIDs and binds the two accounts to one conversation — one
  watermark per conversation view, not per message. The doc now says exactly
  that, including that a leaked capture is evidence of the account-to-account
  association the rest of the design denies the server. Survives only lossless
  captures; UUIDs are pseudonymous. Kept deliberately for leak attribution.
  Watermark code untouched.

### `apps/web/src/lib/storage.test.ts` — new

Codec tests: constant image size regardless of vault count; byte-exact
encode/decode round-trip; legacy/truncated/wrong-version blobs rejected; payload
always exactly SLOT_PAYLOAD_BYTES for tiny and large keystores; capacity overflow
throws; wrong-key/filler payloads never open; two-vault end-to-end unlock via
`tryPassphrase`.

## Verification

- `pnpm typecheck` — clean, all packages.
- `pnpm test` — crypto 26/26 (timing-parity suite untouched and green),
  relay-client 12/12, web 8/8.
- `pnpm --filter @sublemonable/web build` — production build + worker bundling OK.
- `pnpm lint` — all files changed by this branch are Prettier-clean. Pre-existing
  failures on files this branch does not touch: `website` (2 files, confirmed
  present on the clean tree via `git stash`) and `apps/web` (4 files —
  ScreenshotShield.tsx, serialization.ts, ChatList.tsx, VerifyKeys.tsx — none in
  this diff).
- **Real-browser end-to-end** (Playwright + Chromium against `vite dev`, real
  Argon2id, real IndexedDB, real Worker; harness removed after verification):
  legacy record purged on v2 upgrade and never read; exactly one IDB record of
  exactly IMAGE_BYTES; size constant across persist / second vault / destroy;
  correct passphrase unlocks through the worker (~1.5 s), wrong passphrase →
  null; persist racing destroy serializes with destroy winning; persist after
  destroy rejects on the wiped key with no resurrection; destroyed vault no
  longer unlocks; panic wipe leaves zero records. Full PASS (24 assertions).
- `git diff main` touches only `apps/web/src/lib/storage.ts`,
  `apps/web/src/store.ts`, `docs/SECURITY_MODEL.md` (+ new test file):
  `packages/crypto` — including `vault.ts` — is untouched.

## Definition of done

- [x] storage.ts fully migrated to multi-vault model
- [x] gate/unlock flow calls unlockVaultOffThread, not deriveKeyFromPassword
- [x] fixed-size padded per-slot blobs under a single IndexedDB key
- [x] vault count undetectable (fixed image size, pad-then-encrypt, uniform filler)
- [x] vault.ts timing parity preserved (file untouched; suite green; equal-size
      payload decrypt keeps parity end-to-end)
- [x] SECURITY_MODEL.md updated with watermark tradeoff note

## Adversarial self-review

Five-lens audit (count-leakage forensics, timing side-channels, forbidden legacy
paths, integration correctness, DoD/docs accuracy) producing 19 candidate
findings, each triaged by direct code inspection plus independent refuter votes.
Confirmed and **fixed** in this branch:

1. **[critical] Stranded at unlock after deleteAccount + reload** — image
   persists (slot → filler) so bootstrap routes to "unlock", but nothing can
   open an all-filler image and nothing stored may reveal that. Fixed with the
   always-present `resetDevice` escape hatch on the gate.
2. **[high] Destroyed-vault resurrection** — an in-flight `persist()`
   interleaving with `destroyVaultSlot()` could write a pre-destroy slot table
   back to disk. Fixed with the image mutation lock; regression-tested in the
   browser harness (racing persist + destroy → destroy wins, late persist
   rejects on the wiped key, no resurrection).
3. **[high] Stale image cache** — module-level cache never invalidated (cross-
   tab clobbering, failed-write phantom state). Fixed by removing the cache;
   every operation reads the backend fresh.
4. **[medium] Desktop legacy blob never purged** — no analog of the IDB v2
   upgrade delete on Tauri; a variable-size pre-migration keystore lingered as
   a forensic artifact. Initially fixed with a purge-on-sight in
   `loadImageBytes`, then **deliberately reverted** after Codex review (P1)
   showed the purge could destroy a valid file-fallback image (`delete_vault`
   clears both Rust backends and Secret Service shadows the file fallback on
   read). The legacy blob is treated as absent and never parsed; a safe purge
   needs a per-backend delete on the Rust side — desktop follow-up.
5. **[medium] unlock() masked login failures as "Wrong passphrase"** and left
   decrypted key material in state behind the lock screen. Fixed: honest error,
   state cleared, vault key wiped.
6. **[high, docs] Watermark section misdescribed the payload** — code embeds
   both parties' UUIDs per conversation, not "recipient + message ID". Doc
   corrected (see above).
7. **[low] TOCTOU on the wiped-key guard** — fixed with a post-encrypt re-check
   (wipe is synchronous, so the key only flips at await boundaries).

Refuted / accepted-as-documented (not fixed): post-decrypt parse-time residue
(negligible vs 4× Argon2id; now documented); future-version image reads as "no
vault" (downgrade scenarios out of scope); createAccount registers the server
account before the vault persists (pre-existing ordering, orphaned server
account is recoverable server-side).

**Post-PR review rounds** (gemini-code-assist, Copilot, Codex — all findings
triaged against the code and either fixed or answered on the PR):
`openPayload` now wipes the decrypted plaintext on every exit path;
`resetDevice()` tears down sockets/decoy/state before erasing the image; the
IDB upgrade awaits the legacy delete; the two-vault test actually stores two
vaults; `lock()` retires the vault key behind pending persists
(`retireVaultSession`); image mutations take a cross-tab Web Lock; the
desktop legacy purge was reverted as unsafe (see item 4 above); vault
sessions are bound to their slot's on-disk identity (salt ‖ wrapped key),
so a stale session in another tab can never persist into — or destroy — a
slot that has since been re-keyed (persist fails, destroy no-ops; verified
in-browser with forged and genuinely-stale sessions); and `deleteAccount`
tears down app state unconditionally, so a failed local slot overwrite can
no longer strand a dead "ready" session after the server account is gone.

## Known limitations / follow-ups (non-blocking)

- **Desktop invoke transport:** the image crosses Tauri IPC as `number[]` JSON
  (~4 MB serialized per persist). Works; binary IPC is a follow-up optimization.
- **Desktop keystore backends (Rust follow-up):** `load_vault` prefers Secret
  Service and can shadow a valid file-fallback image; `delete_vault` clears
  both backends. Needed: per-backend purge + prefer whichever backend holds a
  valid current-size image, so the web layer can safely purge stale
  pre-migration blobs (currently left at rest, never parsed).
- **Slot capacity:** 256 KiB per payload (~262 KB plaintext). `sealPayload` throws
  a clear error if a keystore ever outgrows it; a tier-growth scheme (grow ALL
  regions together, preserving count-unknowability) is the designed escape hatch.
- **Multi-snapshot diffing and blind-overwrite-on-create** are documented, accepted
  VeraCrypt-analogous bounds (see SECURITY_MODEL.md).
- **Account creation runs one Argon2id on the main thread** (~0.6 s measured in
  Chromium) — the Gate shows a busy state; unlock (4× Argon2id) is the heavy path
  and runs in the worker. Moving creation off-thread would need a worker protocol
  extension (vaultWorker.ts is unlock-only by design today).
- The web client's UI currently reaches "setup" only when no image exists or after
  an in-app account deletion; a "create additional vault" UI is future work — the
  storage layer already supports it (`createVault` into an existing image).
