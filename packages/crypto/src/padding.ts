// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Constant-block padding. Every message is padded to a multiple of 256 bytes
 * before encryption so that ciphertext length leaks nothing about plaintext
 * length — a 3-byte "ok" and a 200-byte paragraph occupy the same block, and a
 * decoy envelope is the same size as a real one. Size analysis is defeated at
 * the block granularity.
 *
 * Layout (before encryption): len(4, big-endian) || plaintext || random fill,
 * total rounded up to the next multiple of BLOCK_BYTES.
 */

import { sodium, ready } from "./sodium.js";

/** Padding block size. Padded plaintext is always a multiple of this. */
export const BLOCK_BYTES = 256;

const LEN_PREFIX_BYTES = 4;

/** Pad `plaintext` up to the next 256-byte boundary. Random fill, not zeros, so
 *  the padding region carries no recoverable structure. */
export async function pad(plaintext: Uint8Array, block: number = BLOCK_BYTES): Promise<Uint8Array> {
  await ready();
  if (plaintext.length > 0xffffffff) throw new Error("plaintext too large to pad");
  const bodyLen = LEN_PREFIX_BYTES + plaintext.length;
  const totalLen = Math.ceil(bodyLen / block) * block || block;
  const out = new Uint8Array(totalLen);
  out[0] = (plaintext.length >>> 24) & 0xff;
  out[1] = (plaintext.length >>> 16) & 0xff;
  out[2] = (plaintext.length >>> 8) & 0xff;
  out[3] = plaintext.length & 0xff;
  out.set(plaintext, LEN_PREFIX_BYTES);
  if (totalLen > bodyLen) out.set(sodium.randombytes_buf(totalLen - bodyLen), bodyLen);
  return out;
}

/** Recover the original plaintext from a padded block. */
export function unpad(padded: Uint8Array): Uint8Array {
  if (padded.length < LEN_PREFIX_BYTES) throw new Error("padded input too short");
  const len =
    (padded[0]! << 24) | (padded[1]! << 16) | (padded[2]! << 8) | padded[3]!;
  const length = len >>> 0;
  if (length > padded.length - LEN_PREFIX_BYTES) throw new Error("corrupt padding length");
  return padded.slice(LEN_PREFIX_BYTES, LEN_PREFIX_BYTES + length);
}

/** Number of 256-byte blocks a plaintext of the given length will occupy. */
export function paddedBlockCount(plaintextLength: number, block: number = BLOCK_BYTES): number {
  return Math.ceil((LEN_PREFIX_BYTES + plaintextLength) / block) || 1;
}
