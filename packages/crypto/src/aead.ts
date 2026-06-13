// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { sodium, ready } from "./sodium.js";
import { concat } from "./encoding.js";

export const NONCE_BYTES = 12;

/**
 * AES-256-GCM via WebCrypto (hardware-accelerated in every supported browser
 * and Node ≥ 20). A fresh random nonce is generated on EVERY call — nonce
 * reuse under GCM is catastrophic, so no caller-supplied nonces are accepted.
 * Output layout: nonce(12) || ciphertext+tag.
 */
export async function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array,
): Promise<Uint8Array> {
  await ready();
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const cryptoKey = await importAesKey(key, "encrypt");
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: associatedData ? toArrayBuffer(associatedData) : undefined,
    },
    cryptoKey,
    toArrayBuffer(plaintext),
  );
  return concat(nonce, new Uint8Array(ct));
}

export async function aeadDecrypt(
  key: Uint8Array,
  box: Uint8Array,
  associatedData?: Uint8Array,
): Promise<Uint8Array> {
  if (box.length <= NONCE_BYTES) throw new Error("ciphertext too short");
  const nonce = box.slice(0, NONCE_BYTES);
  const ct = box.slice(NONCE_BYTES);
  const cryptoKey = await importAesKey(key, "decrypt");
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: associatedData ? toArrayBuffer(associatedData) : undefined,
    },
    cryptoKey,
    toArrayBuffer(ct),
  );
  return new Uint8Array(pt);
}

function importAesKey(key: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");
  return crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM" }, false, [usage]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
