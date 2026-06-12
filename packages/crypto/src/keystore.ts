// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { aeadDecrypt, aeadEncrypt } from "./aead.js";
import { utf8Decode, utf8Encode } from "./encoding.js";

/**
 * The local key store: everything secret the client owns, serialized as JSON
 * with byte fields hex-encoded. Keys are NEVER stored in plaintext at rest —
 * this blob is what goes into IndexedDB, encrypted under the Argon2id-derived
 * master key.
 */
export interface KeyStore {
  version: 1;
  accountId: string;
  identityKey: { publicKey: string; privateKey: string };
  signedPrekeys: Array<{
    id: number;
    publicKey: string;
    privateKey: string;
    signature: string;
    createdAt: number;
  }>;
  oneTimePrekeys: Array<{ id: number; publicKey: string; privateKey: string }>;
  /** Serialized ratchet sessions keyed by peer account ID */
  sessions: Record<string, unknown>;
  /** Verified peer identity keys (Safety Number basis), keyed by peer account ID */
  verifiedContacts: Record<string, string>;
}

const KEYSTORE_AD = utf8Encode("Sublemonable-KeyStore-v1");

/** Encrypt the key store for storage at rest (AES-256-GCM, fresh nonce inside). */
export async function encryptKeyStore(masterKey: Uint8Array, keyStore: KeyStore): Promise<Uint8Array> {
  return aeadEncrypt(masterKey, utf8Encode(JSON.stringify(keyStore)), KEYSTORE_AD);
}

/** Decrypt the key store. Throws on a wrong passphrase (GCM tag failure). */
export async function decryptKeyStore(masterKey: Uint8Array, encryptedBlob: Uint8Array): Promise<KeyStore> {
  const plaintext = await aeadDecrypt(masterKey, encryptedBlob, KEYSTORE_AD);
  const parsed = JSON.parse(utf8Decode(plaintext)) as KeyStore;
  if (parsed.version !== 1) throw new Error("unsupported keystore version");
  return parsed;
}
