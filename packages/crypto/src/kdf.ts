// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { sodium, ready } from "./sodium.js";
import { concat, utf8Encode } from "./encoding.js";

/** HKDF-SHA-256 (RFC 5869) built on libsodium's HMAC-SHA-256. */
export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array> {
  await ready();
  const prk = sodium.crypto_auth_hmacsha256(ikm, normalizeKey(salt));
  const infoBytes = utf8Encode(info);
  const blocks: Uint8Array[] = [];
  let previous: Uint8Array = new Uint8Array(0);
  for (let i = 1; blocks.reduce((n, b) => n + b.length, 0) < length; i++) {
    previous = sodium.crypto_auth_hmacsha256(
      concat(previous, infoBytes, new Uint8Array([i])),
      prk,
    );
    blocks.push(previous);
  }
  return concat(...blocks).slice(0, length);
}

// HMAC-SHA-256 keys must be exactly 32 bytes for libsodium's crypto_auth
function normalizeKey(key: Uint8Array): Uint8Array {
  if (key.length === 32) return key;
  const out = new Uint8Array(32);
  out.set(key.slice(0, 32));
  return out;
}

export const ARGON2ID_PARAMS = {
  /** 65536 KB */
  memLimitBytes: 65536 * 1024,
  iterations: 3,
  // Note: libsodium's Argon2id implementation uses parallelism=1 internally;
  // the spec's parallelism=4 applies to the native-platform implementations.
  parallelism: 4,
} as const;

export const SALT_BYTES = 16;
export const MASTER_KEY_BYTES = 32;

export async function generateSalt(): Promise<Uint8Array> {
  await ready();
  return sodium.randombytes_buf(SALT_BYTES);
}

/** Derive the local keystore master key from the user's passphrase via Argon2id. */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  await ready();
  if (salt.length !== SALT_BYTES) throw new Error("salt must be 16 bytes");
  return sodium.crypto_pwhash(
    MASTER_KEY_BYTES,
    password,
    salt,
    ARGON2ID_PARAMS.iterations,
    ARGON2ID_PARAMS.memLimitBytes,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}
