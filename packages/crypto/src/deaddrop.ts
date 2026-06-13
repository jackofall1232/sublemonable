// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

/**
 * Dead-drop primitives: one-time access tokens and the hashcash proof-of-work a
 * client must solve to deposit anonymously.
 *
 * A drop is a capability. The 256-bit token is the secret shared out of band
 * (QR, in person). Its SHA-256 is the public drop ID the relay stores under. The
 * relay only ever sees the hash, so possessing the drop ID does not let an
 * observer redeem the drop — redemption requires the token preimage. The relay
 * needs no account from either party: anonymity of sender and recipient both
 * rest on there being no identity to present.
 *
 * Deposit carries no authentication; a hashcash puzzle bound to the drop ID
 * stands in for it, so spam costs CPU rather than being free, without anyone
 * having to log in.
 */

import { sodium, ready } from "./sodium.js";

/** Length of a dead-drop access token (256 bits). */
export const DROP_TOKEN_BYTES = 32;

/** Default deposit proof-of-work difficulty, in leading zero bits. */
export const DEFAULT_POW_DIFFICULTY = 20;

/** A token (the out-of-band secret) and its drop ID (the public, stored hash). */
export interface DropCredentials {
  /** 32 random bytes — shared with the recipient out of band, never sent on deposit. */
  token: Uint8Array;
  /** SHA-256(token) — the public identifier the relay stores the envelope under. */
  dropId: Uint8Array;
}

/** Mint a fresh single-use dead-drop token and its derived drop ID. */
export async function generateDropToken(): Promise<DropCredentials> {
  await ready();
  const token = sodium.randombytes_buf(DROP_TOKEN_BYTES);
  return { token, dropId: dropIdFromToken(token) };
}

/** Derive the public drop ID from a token: SHA-256(token). */
export function dropIdFromToken(token: Uint8Array): Uint8Array {
  return sodium.crypto_hash_sha256(token);
}

/**
 * Solve a hashcash puzzle: find an 8-byte counter nonce such that
 * SHA-256(challenge || nonce) begins with `difficulty` zero bits. The challenge
 * is the drop ID, binding the work to this specific deposit so it cannot be
 * precomputed or reused. Returns the winning nonce.
 */
export async function solveProofOfWork(
  challenge: Uint8Array,
  difficulty: number = DEFAULT_POW_DIFFICULTY,
): Promise<Uint8Array> {
  await ready();
  const nonce = new Uint8Array(8);
  for (;;) {
    if (hasLeadingZeroBits(sodium.crypto_hash_sha256(concatBytes(challenge, nonce)), difficulty)) {
      return nonce.slice();
    }
    incrementCounter(nonce);
  }
}

/** Verify a hashcash solution. */
export function verifyProofOfWork(
  challenge: Uint8Array,
  nonce: Uint8Array,
  difficulty: number = DEFAULT_POW_DIFFICULTY,
): boolean {
  if (nonce.length !== 8) return false;
  return hasLeadingZeroBits(sodium.crypto_hash_sha256(concatBytes(challenge, nonce)), difficulty);
}

/** True if `digest` begins with at least `bits` zero bits (most-significant first). */
export function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
  let remaining = bits;
  for (const byte of digest) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
    } else {
      return (byte >>> (8 - remaining)) === 0;
    }
  }
  return remaining <= 0;
}

function incrementCounter(counter: Uint8Array): void {
  for (let i = counter.length - 1; i >= 0; i--) {
    counter[i] = (counter[i]! + 1) & 0xff;
    if (counter[i] !== 0) return; // no carry
  }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
