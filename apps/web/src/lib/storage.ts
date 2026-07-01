// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Multi-vault persistence: the plausible-deniability disk image.
//
// Everything at rest lives in ONE fixed-size byte image stored under a single
// key. The image always contains exactly SLOT_COUNT key slots and SLOT_COUNT
// payload regions, whether zero, one, or four vaults are real:
//
//   version(1) ‖ SLOT_COUNT × [salt(16) ‖ wrapped key(60)] ‖ SLOT_COUNT × payload(SLOT_PAYLOAD_BYTES)
//
// A real payload is the vault's keystore JSON padded to the full plaintext
// capacity of its region and then AES-256-GCM-encrypted under that vault's key
// (pad-then-encrypt — the length prefix sits INSIDE the ciphertext, so a real
// payload is byte-for-byte indistinguishable from the uniformly random bytes
// that fill unused regions). A filler payload is fresh CSPRNG output. The image
// is a compile-time-constant IMAGE_BYTES long no matter how many vaults exist,
// so neither the size, the structure, nor any byte of the stored material
// reveals the vault count.
//
// Unlocking goes through unlockVaultOffThread (a Web Worker running
// tryPassphrase), which derives Argon2id for and attempts to unwrap EVERY slot
// with no early exit — see packages/crypto/src/vault.ts for the timing-parity
// contract. Because every payload region is the same size, opening vault A
// costs exactly the same work as opening vault B.
//
// Two backends, selected at runtime:
//   • Browser (default): IndexedDB, one record.
//   • Desktop (Tauri):   the Rust keystore commands (libsecret with a file
//     fallback). The desktop backend is a storage adapter only — it receives
//     the already-encrypted image bytes, exactly the bytes that would otherwise
//     go to IndexedDB. Rust never decrypts.
//
// There is NO single-blob fallback: the legacy v1 record is deleted on upgrade
// and never read.

import { openDB, type IDBPDatabase } from "idb";
import {
  addVaultSlot,
  aeadDecrypt,
  aeadEncrypt,
  createVaultSlots,
  isTauri,
  NONCE_BYTES,
  randomSlot,
  SALT_BYTES,
  SLOT_COUNT,
  unpad,
  utf8Decode,
  utf8Encode,
  wipe,
  WRAPPED_KEY_BYTES,
  type KeySlot,
  type KeyStore,
} from "@sublemonable/crypto";
import { unlockVaultOffThread } from "./vaultWorker.js";

const DB_NAME = "sublemonable";
const STORE = "vault";
const IMAGE_KEY = "image";
/** v1 single-blob record — deleted on upgrade, never read. */
const LEGACY_KEY = "keystore";

// ── image geometry (all compile-time constants) ──────────────────────────────

const IMAGE_VERSION = 2;
const HEADER_BYTES = 1;
const SLOT_ENTRY_BYTES = SALT_BYTES + WRAPPED_KEY_BYTES;
const SLOT_TABLE_BYTES = SLOT_COUNT * SLOT_ENTRY_BYTES;

/** Fixed size of every payload region, real or filler. */
export const SLOT_PAYLOAD_BYTES = 256 * 1024;

const GCM_TAG_BYTES = 16;

/** Plaintext capacity of a payload region (AEAD adds nonce + GCM tag). */
export const PAYLOAD_PLAINTEXT_BYTES = SLOT_PAYLOAD_BYTES - NONCE_BYTES - GCM_TAG_BYTES;

/** Total image size — constant regardless of how many vaults are real. */
export const IMAGE_BYTES = HEADER_BYTES + SLOT_TABLE_BYTES + SLOT_COUNT * SLOT_PAYLOAD_BYTES;

// Associated data binds a payload to its purpose. Intentionally generic — it
// names nothing about slot position, vault count, or "decoy" status.
const PAYLOAD_AD = utf8Encode("Sublemonable-Vault-Payload-v1");

/** Handle to an unlocked vault: its data key and which slot it occupies. */
export interface VaultSession {
  vaultKey: Uint8Array;
  slotIndex: number;
}

/** The image in structured form. `payloads[i]` belongs to `slots[i]`. */
export interface VaultImage {
  slots: KeySlot[];
  payloads: Uint8Array[];
}

// ── pure image codec (exported for tests) ────────────────────────────────────

export function encodeImage(image: VaultImage): Uint8Array {
  if (image.slots.length !== SLOT_COUNT || image.payloads.length !== SLOT_COUNT) {
    throw new Error("vault image must have exactly SLOT_COUNT slots");
  }
  const out = new Uint8Array(IMAGE_BYTES);
  out[0] = IMAGE_VERSION;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = image.slots[i]!;
    const payload = image.payloads[i]!;
    if (slot.salt.length !== SALT_BYTES || slot.wrapped.length !== WRAPPED_KEY_BYTES) {
      throw new Error("malformed key slot");
    }
    if (payload.length !== SLOT_PAYLOAD_BYTES) throw new Error("malformed payload region");
    const entryOffset = HEADER_BYTES + i * SLOT_ENTRY_BYTES;
    out.set(slot.salt, entryOffset);
    out.set(slot.wrapped, entryOffset + SALT_BYTES);
    out.set(payload, HEADER_BYTES + SLOT_TABLE_BYTES + i * SLOT_PAYLOAD_BYTES);
  }
  return out;
}

export function decodeImage(bytes: Uint8Array): VaultImage {
  if (bytes.length !== IMAGE_BYTES) throw new Error("not a vault image");
  if (bytes[0] !== IMAGE_VERSION) throw new Error("unsupported vault image version");
  const slots: KeySlot[] = [];
  const payloads: Uint8Array[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const entryOffset = HEADER_BYTES + i * SLOT_ENTRY_BYTES;
    // slice(), not subarray() — slots cross a structured-clone boundary into
    // the unlock worker, and cloning a view would drag the whole image along.
    slots.push({
      salt: bytes.slice(entryOffset, entryOffset + SALT_BYTES),
      wrapped: bytes.slice(entryOffset + SALT_BYTES, entryOffset + SLOT_ENTRY_BYTES),
    });
    const payloadOffset = HEADER_BYTES + SLOT_TABLE_BYTES + i * SLOT_PAYLOAD_BYTES;
    payloads.push(bytes.slice(payloadOffset, payloadOffset + SLOT_PAYLOAD_BYTES));
  }
  return { slots, payloads };
}

// Bulk CSPRNG fill. crypto.getRandomValues is the same platform entropy source
// libsodium draws from, but native — libsodium.js's WASM randombytes_buf costs
// ~0.5 s at payload size, which would tax every persist. Calls are chunked at
// the API's 64 KiB per-call quota.
function fillRandom(out: Uint8Array): Uint8Array {
  const CHUNK = 65536;
  for (let offset = 0; offset < out.length; offset += CHUNK) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + CHUNK, out.length)));
  }
  return out;
}

// Exact-fit padding: len(4 BE) ‖ plaintext ‖ random fill, always exactly
// PAYLOAD_PLAINTEXT_BYTES — the same layout as packages/crypto pad(), so
// unpad() recovers it. The fill sits INSIDE the AEAD plaintext; its only job
// is carrying no recoverable structure.
function padToCapacity(plaintext: Uint8Array): Uint8Array {
  const out = new Uint8Array(PAYLOAD_PLAINTEXT_BYTES);
  out[0] = (plaintext.length >>> 24) & 0xff;
  out[1] = (plaintext.length >>> 16) & 0xff;
  out[2] = (plaintext.length >>> 8) & 0xff;
  out[3] = plaintext.length & 0xff;
  out.set(plaintext, 4);
  fillRandom(out.subarray(4 + plaintext.length));
  return out;
}

/**
 * Seal a keystore into a payload region: pad to full plaintext capacity, THEN
 * encrypt. Output is always exactly SLOT_PAYLOAD_BYTES. The order is
 * load-bearing: padding after encryption would put a plaintext length prefix
 * on disk, statistically distinguishing real payloads from random filler and
 * leaking the vault count.
 */
export async function sealPayload(vaultKey: Uint8Array, keyStore: KeyStore): Promise<Uint8Array> {
  // A wiped key is all zeros (see wipe()). Refuse it: a lock() racing an
  // in-flight persist must fail loudly here, not silently seal the keystore
  // under a dead key and lose the vault forever. wipe() is synchronous and JS
  // is single-threaded, so the key only ever flips at await boundaries —
  // checking before AND after the encrypt leaves no window where a
  // mid-flight wipe could reach disk.
  const wiped = () => vaultKey.every((b) => b === 0);
  if (wiped()) throw new Error("vault key has been wiped");
  const plaintext = utf8Encode(JSON.stringify(keyStore));
  if (4 + plaintext.length > PAYLOAD_PLAINTEXT_BYTES) {
    wipe(plaintext);
    throw new Error("keystore exceeds vault slot capacity");
  }
  const padded = padToCapacity(plaintext);
  wipe(plaintext);
  try {
    const sealed = await aeadEncrypt(vaultKey, padded, PAYLOAD_AD);
    if (wiped()) throw new Error("vault key has been wiped");
    if (sealed.length !== SLOT_PAYLOAD_BYTES) throw new Error("sealed payload size mismatch");
    return sealed;
  } finally {
    wipe(padded);
  }
}

/** Open a payload region with an unlocked vault key. Throws on tampering or a
 *  key/payload mismatch (GCM tag failure). */
export async function openPayload(vaultKey: Uint8Array, payload: Uint8Array): Promise<KeyStore> {
  const padded = await aeadDecrypt(vaultKey, payload, PAYLOAD_AD);
  // unpad() returns a copy, so BOTH buffers hold keystore plaintext — wipe
  // both in the finally so no throw path (unpad, JSON.parse, version check)
  // can leave decrypted material lingering in memory.
  let plaintext: Uint8Array | null = null;
  try {
    plaintext = unpad(padded);
    const parsed = JSON.parse(utf8Decode(plaintext)) as KeyStore;
    if (parsed.version !== 1) throw new Error("unsupported keystore version");
    return parsed;
  } finally {
    if (plaintext) wipe(plaintext);
    wipe(padded);
  }
}

/** A filler payload region: CSPRNG bytes, indistinguishable from a sealed one. */
export function randomPayload(): Uint8Array {
  return fillRandom(new Uint8Array(SLOT_PAYLOAD_BYTES));
}

// ── Tauri desktop backend ────────────────────────────────────────────────────

interface TauriGlobal {
  core: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
}

function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (!tauri) throw new Error("Tauri runtime unavailable");
  return tauri.core.invoke<T>(cmd, args);
}

// ── IndexedDB browser backend ────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 2, {
    async upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) database.createObjectStore(STORE);
      // v1 stored a single-blob keystore. That model is gone — purge the
      // record so no fallback path can ever read it. Awaited so a failed
      // delete fails the upgrade deterministically instead of surfacing as
      // an unhandled rejection.
      if (oldVersion === 1) await tx.objectStore(STORE).delete(LEGACY_KEY);
    },
  });
  return dbPromise;
}

// ── raw image I/O ────────────────────────────────────────────────────────────

// Every mutation is a whole-image read-decode-modify-encode-write cycle. Two
// rules keep that safe:
//
//  1. NO in-memory cache. Each operation reads the backend fresh, so a write
//     that failed (or another tab's write) can never leave memory claiming
//     state the disk doesn't have — e.g. a vault destroy that never landed, or
//     a destroyed vault resurrected from a stale snapshot.
//  2. Mutations serialize through `withImageLock`: a promise chain within this
//     realm, plus a Web Lock across realms, so a persist in one tab can never
//     interleave with a persist/destroy in another and write back a stale copy
//     of the other slot's payload. (Tauri is a single webview; the realm chain
//     alone covers it, and navigator.locks is used there too when present.)
//
// Cost: ~1 MiB backend read per persist — single-digit milliseconds on
// IndexedDB, acceptable on the Tauri invoke path.

const IMAGE_LOCK = "sublemonable-vault-image";

let imageOp: Promise<unknown> = Promise.resolve();

function withImageLock<T>(fn: () => Promise<T>): Promise<T> {
  // lib.dom types LockManager.request without flowing the callback's return
  // type through, hence the cast.
  const locked = (): Promise<T> =>
    typeof navigator !== "undefined" && navigator.locks
      ? (navigator.locks.request(IMAGE_LOCK, fn) as Promise<T>)
      : fn();
  const run = imageOp.then(locked, locked);
  imageOp = run.catch(() => undefined);
  return run;
}

async function loadImageBytes(): Promise<Uint8Array | null> {
  let raw: Uint8Array | null = null;
  if (isTauri()) {
    const stored = await tauriInvoke<number[] | null>("load_vault");
    raw = stored ? new Uint8Array(stored) : null;
  } else {
    const value: unknown = await (await db()).get(STORE, IMAGE_KEY);
    raw = value instanceof Uint8Array ? value : null;
  }
  // Anything that isn't exactly a current-version image is treated as absent,
  // never parsed. On desktop that leaves a stale pre-migration single-blob
  // keystore at rest, which we deliberately do NOT purge from here:
  // delete_vault clears BOTH Rust backends (Secret Service and the file
  // fallback), so a blind purge of an invalid Secret Service blob could
  // destroy a valid image living in the file fallback. A safe purge needs a
  // per-backend delete on the Rust side — tracked as a desktop follow-up. The
  // stale blob is overwritten naturally the next time a vault is created on
  // the active backend.
  if (!raw || raw.length !== IMAGE_BYTES || raw[0] !== IMAGE_VERSION) return null;
  return raw;
}

async function saveImageBytes(image: Uint8Array): Promise<void> {
  if (isTauri()) {
    // number[] JSON framing is Tauri's invoke transport — heavy for ~1 MiB but
    // correct; binary IPC is a follow-up optimization.
    await tauriInvoke("store_vault", { blob: Array.from(image) });
    return;
  }
  await (await db()).put(STORE, image, IMAGE_KEY);
}

// ── public vault interface ───────────────────────────────────────────────────

/** Whether a vault image exists at all. Says nothing about how many vaults it
 *  holds — that is unknowable by design. */
export async function hasVault(): Promise<boolean> {
  return (await loadImageBytes()) !== null;
}

/**
 * Create a vault sealed under `passphrase` and persist it.
 *
 * Fresh device: builds a new image — SLOT_COUNT slots, one real, the rest
 * random filler with random payloads.
 *
 * Existing image: seals the new vault into a random slot. Which slots hold
 * live vaults is unknowable from storage (that's the point), so this can
 * overwrite a vault whose passphrase isn't currently entered — the same
 * documented tradeoff as writing to a VeraCrypt outer volume without mounting
 * the hidden one. See docs/SECURITY_MODEL.md.
 */
export function createVault(passphrase: string, keyStore: KeyStore): Promise<VaultSession> {
  return withImageLock(async () => {
    const existing = await loadImageBytes();
    let slots: KeySlot[];
    let payloads: Uint8Array[];
    let vaultKey: Uint8Array;
    let slotIndex: number;

    if (existing) {
      const image = decodeImage(existing);
      const added = await addVaultSlot(image.slots, new Set(), passphrase);
      ({ slots, vaultKey, slotIndex } = added);
      payloads = image.payloads;
    } else {
      const created = await createVaultSlots(passphrase);
      ({ slots, vaultKey, slotIndex } = created);
      payloads = [];
      for (let i = 0; i < SLOT_COUNT; i++) payloads.push(randomPayload());
    }

    payloads[slotIndex] = await sealPayload(vaultKey, keyStore);
    await saveImageBytes(encodeImage({ slots, payloads }));
    return { vaultKey, slotIndex };
  });
}

/**
 * Attempt `passphrase` against the image. Runs tryPassphrase in the unlock
 * worker — every slot is derived and tried with identical work, so a decoy
 * unlock and a real unlock are indistinguishable to a stopwatch. Returns null
 * when no image exists or no slot matches (a wrong passphrase).
 */
export async function unlockVault(
  passphrase: string,
): Promise<{ keyStore: KeyStore; session: VaultSession } | null> {
  const bytes = await loadImageBytes();
  if (!bytes) return null;
  const image = decodeImage(bytes);
  const unlocked = await unlockVaultOffThread(passphrase, image.slots);
  if (!unlocked) return null;
  let keyStore: KeyStore;
  try {
    keyStore = await openPayload(unlocked.vaultKey, image.payloads[unlocked.slotIndex]!);
  } catch (e) {
    // Corrupt payload — the key is unlocked but useless. Don't leave it live.
    wipe(unlocked.vaultKey);
    throw e;
  }
  return { keyStore, session: { vaultKey: unlocked.vaultKey, slotIndex: unlocked.slotIndex } };
}

/** Re-seal and write the session's keystore into its payload region. All other
 *  regions are preserved byte-for-byte (their keys are not ours to have). */
export function persistVault(session: VaultSession, keyStore: KeyStore): Promise<void> {
  return withImageLock(async () => {
    const bytes = await loadImageBytes();
    if (!bytes) throw new Error("no vault image");
    const image = decodeImage(bytes);
    image.payloads[session.slotIndex] = await sealPayload(session.vaultKey, keyStore);
    await saveImageBytes(encodeImage(image));
  });
}

/**
 * Destroy ONE vault: overwrite its slot and payload with fresh random bytes,
 * turning it back into filler. The image keeps its exact size and shape, other
 * vaults are untouched, and nothing records that a vault was ever here. Wipes
 * the session key.
 */
export function destroyVaultSlot(session: VaultSession): Promise<void> {
  return withImageLock(async () => {
    try {
      const bytes = await loadImageBytes();
      if (!bytes) return;
      const image = decodeImage(bytes);
      image.slots[session.slotIndex] = await randomSlot();
      image.payloads[session.slotIndex] = randomPayload();
      await saveImageBytes(encodeImage(image));
    } finally {
      wipe(session.vaultKey);
    }
  });
}

/**
 * Queue a vault-key wipe behind every already-queued image mutation. lock()
 * must retire the key this way rather than wiping in place: an in-flight
 * persist seals with this exact Uint8Array, and zeroing it mid-queue would
 * drop the mutation (sealPayload fails closed on a wiped key) after its side
 * effects — an advanced ratchet, a sent message — already happened.
 */
export function retireVaultSession(session: VaultSession): Promise<void> {
  return withImageLock(async () => wipe(session.vaultKey));
}

/** Panic wipe: delete the entire image — every vault, real or filler. */
export function destroyVaultImage(): Promise<void> {
  return withImageLock(async () => {
    if (isTauri()) {
      await tauriInvoke("delete_vault");
      return;
    }
    await (await db()).delete(STORE, IMAGE_KEY);
  });
}
