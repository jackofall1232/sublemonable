// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

/**
 * Key-slot architecture for the storage layer.
 *
 * The app maintains a fixed array of key slots. Each slot is a random 16-byte
 * salt plus an AES-256-GCM-wrapped 32-byte vault key. A passphrase is checked by
 * attempting to unwrap EVERY slot; the first slot whose AEAD tag verifies yields
 * the active vault key.
 *
 * Two properties are load-bearing and non-negotiable:
 *
 *  1. The integer number of vaults is never stored. Every disk image contains
 *     exactly SLOT_COUNT slots; unused slots hold uniformly random bytes that are
 *     byte-for-byte indistinguishable from a real wrapped key. A slot that fails
 *     to decrypt is indistinguishable from a wrong passphrase, and the count of
 *     real vaults is unknowable from the stored material.
 *
 *  2. Every passphrase attempt does identical work. `tryPassphrase` derives a key
 *     for and attempts to unwrap ALL slots with no early exit, so the wall-clock
 *     time is the same whether the passphrase matches slot 0, matches slot 1, or
 *     matches nothing. There is no shortcut on any path — a stopwatch cannot tell
 *     a decoy unlock from a real unlock.
 *
 * This mirrors the VeraCrypt hidden-volume model: providing one passphrase opens
 * one real profile and reveals nothing about whether another exists.
 *
 * Performance note: `tryPassphrase` runs Argon2id once PER slot (each slot has
 * its own salt) — deliberately, for maximal isolation between vaults. That makes
 * an unlock CPU-heavy (SLOT_COUNT derivations). Callers on the main thread of a
 * UI MUST run it off-thread (a Web Worker on web; a background queue/coroutine on
 * iOS/Android) so the unlock never freezes the interface. See
 * apps/web/src/lib/vaultWorker.ts for the web wrapper.
 */

import { sodium, ready } from "./sodium.js";
import { aeadDecrypt, aeadEncrypt } from "./aead.js";
import { deriveKeyFromPassword, SALT_BYTES, MASTER_KEY_BYTES } from "./kdf.js";
import { utf8Encode } from "./encoding.js";

/** Fixed number of slots on every disk image. Real or random, the count is constant. */
export const SLOT_COUNT = 4;

/** Length of a wrapped vault key: nonce(12) + ciphertext(32) + GCM tag(16). */
export const WRAPPED_KEY_BYTES = 12 + MASTER_KEY_BYTES + 16;

/** Length of the vault key the slots protect. */
export const VAULT_KEY_BYTES = 32;

// Associated data binds a wrapped key to its purpose. It is intentionally
// generic — it names nothing about vault ordering, count, or "decoy" status.
const SLOT_AD = utf8Encode("Sublemonable-Vault-Slot-v1");

/**
 * One key slot as it sits on disk: a salt and a wrapped key. Both fields are
 * always present and always the same size, whether the slot is real or filler.
 */
export interface KeySlot {
  /** 16-byte Argon2id salt. */
  salt: Uint8Array;
  /** AES-256-GCM(masterKey, vaultKey): nonce || ciphertext || tag. */
  wrapped: Uint8Array;
}

/** Result of a successful unlock. `slotIndex` is for the caller's bookkeeping only. */
export interface VaultUnlock {
  vaultKey: Uint8Array;
  slotIndex: number;
}

/** Pluggable key deriver — defaults to Argon2id. Injectable so timing-parity
 *  tests can substitute a fast stand-in without weakening production behavior. */
export type KeyDeriver = (passphrase: string, salt: Uint8Array) => Promise<Uint8Array>;

const defaultDeriver: KeyDeriver = deriveKeyFromPassword;

/** Cryptographically random bytes. */
export async function randomBytes(length: number): Promise<Uint8Array> {
  await ready();
  return sodium.randombytes_buf(length);
}

/**
 * A filler slot: a random salt and random bytes the exact length of a real
 * wrapped key. Indistinguishable from an occupied slot. No passphrase will ever
 * unwrap it (a random 16-byte tail is a valid GCM tag with probability 2^-128).
 */
export async function randomSlot(): Promise<KeySlot> {
  return {
    salt: await randomBytes(SALT_BYTES),
    wrapped: await randomBytes(WRAPPED_KEY_BYTES),
  };
}

/** Wrap a vault key under a passphrase, producing a real, unlockable slot. */
export async function sealSlot(
  passphrase: string,
  vaultKey: Uint8Array,
  deriver: KeyDeriver = defaultDeriver,
): Promise<KeySlot> {
  if (vaultKey.length !== VAULT_KEY_BYTES) throw new Error("vault key must be 32 bytes");
  await ready();
  const salt = await randomBytes(SALT_BYTES);
  const masterKey = await deriver(passphrase, salt);
  try {
    const wrapped = await aeadEncrypt(masterKey, vaultKey, SLOT_AD);
    return { salt, wrapped };
  } finally {
    wipe(masterKey);
  }
}

/**
 * Initialize a fresh disk image: SLOT_COUNT slots, exactly one of which is the
 * real vault sealed under `passphrase`. The rest are random filler. The returned
 * `vaultKey` is the random key the caller should use to encrypt the vault's data.
 */
export async function createVaultSlots(
  passphrase: string,
  deriver: KeyDeriver = defaultDeriver,
): Promise<{ slots: KeySlot[]; vaultKey: Uint8Array; slotIndex: number }> {
  const vaultKey = await randomBytes(VAULT_KEY_BYTES);
  const slots: KeySlot[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) slots.push(await randomSlot());
  // Place the real slot at a random index so position leaks nothing either.
  const slotIndex = randomIndex(SLOT_COUNT);
  slots[slotIndex] = await sealSlot(passphrase, vaultKey, deriver);
  return { slots, vaultKey, slotIndex };
}

/**
 * Seal a second (or third…) vault into a previously-filler slot. The new vault
 * gets its own independent random vault key — vaults share no key material. The
 * slot chosen is a random currently-unoccupied one so the layout still reveals
 * nothing. Throws if every slot is already occupied by a known vault.
 */
export async function addVaultSlot(
  slots: KeySlot[],
  occupied: ReadonlySet<number>,
  passphrase: string,
  deriver: KeyDeriver = defaultDeriver,
): Promise<{ slots: KeySlot[]; vaultKey: Uint8Array; slotIndex: number }> {
  const free: number[] = [];
  for (let i = 0; i < slots.length; i++) if (!occupied.has(i)) free.push(i);
  if (free.length === 0) throw new Error("no free key slots");
  const slotIndex = free[randomIndex(free.length)]!;
  const vaultKey = await randomBytes(VAULT_KEY_BYTES);
  const next = slots.slice();
  next[slotIndex] = await sealSlot(passphrase, vaultKey, deriver);
  return { slots: next, vaultKey, slotIndex };
}

/**
 * Attempt a passphrase against all slots. Returns the unlocked vault key, or null
 * if no slot matched (indistinguishable from a wrong passphrase).
 *
 * Critically: this derives a key for and attempts to unwrap EVERY slot, with no
 * early break, so the work performed — and therefore the wall-clock time — is
 * identical regardless of which slot (if any) matches.
 */
export async function tryPassphrase(
  passphrase: string,
  slots: readonly KeySlot[],
  deriver: KeyDeriver = defaultDeriver,
): Promise<VaultUnlock | null> {
  await ready();
  let found: VaultUnlock | null = null;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const masterKey = await deriver(passphrase, slot.salt);
    try {
      const vaultKey = await aeadDecrypt(masterKey, slot.wrapped, SLOT_AD);
      // Record the first match but DO NOT break — every slot is always tried.
      if (found === null) found = { vaultKey, slotIndex: i };
      else wipe(vaultKey);
    } catch {
      // Wrong key for this slot, or a filler slot. Indistinguishable, by design.
    } finally {
      wipe(masterKey);
    }
  }
  return found;
}

/** Overwrite key material in place. Call the moment a key is no longer needed. */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

// Uniform random index in [0, n) drawn from the CSPRNG (no modulo bias for the
// small n we use here).
function randomIndex(n: number): number {
  const buf = sodium.randombytes_buf(4);
  const v = (buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!;
  return (v >>> 0) % n;
}
