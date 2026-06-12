// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { sodium, ready } from "./sodium.js";

/**
 * The identity key is an Ed25519 keypair (so it can sign prekeys); its X25519
 * form — derived via the birational map — is what participates in X3DH DH
 * computations. The Ed25519 public key is what gets published and fingerprinted.
 */
export interface IdentityKeyPair {
  /** Ed25519 public key — published to the server */
  publicKey: Uint8Array;
  /** Ed25519 secret key — never leaves the device */
  privateKey: Uint8Array;
  /** X25519 form, used for DH */
  x25519PublicKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
}

export interface SignedPrekey {
  id: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  /** Ed25519 signature of publicKey by the identity key */
  signature: Uint8Array;
  createdAt: number;
}

export interface OneTimePrekey {
  id: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await ready();
  const ed = sodium.crypto_sign_keypair();
  return {
    publicKey: ed.publicKey,
    privateKey: ed.privateKey,
    x25519PublicKey: sodium.crypto_sign_ed25519_pk_to_curve25519(ed.publicKey),
    x25519PrivateKey: sodium.crypto_sign_ed25519_sk_to_curve25519(ed.privateKey),
  };
}

/** Convert a peer's published Ed25519 identity key to its X25519 form for DH. */
export async function identityKeyToX25519(edPublicKey: Uint8Array): Promise<Uint8Array> {
  await ready();
  return sodium.crypto_sign_ed25519_pk_to_curve25519(edPublicKey);
}

export async function generateSignedPrekey(
  identityKey: IdentityKeyPair,
  id: number,
): Promise<SignedPrekey> {
  await ready();
  const kp = sodium.crypto_box_keypair();
  return {
    id,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    signature: sodium.crypto_sign_detached(kp.publicKey, identityKey.privateKey),
    createdAt: Date.now(),
  };
}

export async function verifySignedPrekey(
  prekeyPublic: Uint8Array,
  signature: Uint8Array,
  identityPublicKey: Uint8Array,
): Promise<boolean> {
  await ready();
  return sodium.crypto_sign_verify_detached(signature, prekeyPublic, identityPublicKey);
}

/** One-time prekeys are single-use by design — the private half is deleted after consumption. */
export async function generateOneTimePrekeys(
  count: number,
  startId = 1,
): Promise<OneTimePrekey[]> {
  await ready();
  return Array.from({ length: count }, (_, i) => {
    const kp = sodium.crypto_box_keypair();
    return { id: startId + i, publicKey: kp.publicKey, privateKey: kp.privateKey };
  });
}

/** Sign an arbitrary message with the Ed25519 identity key (login challenges). */
export async function signWithIdentity(
  message: Uint8Array,
  identityKey: IdentityKeyPair,
): Promise<Uint8Array> {
  await ready();
  return sodium.crypto_sign_detached(message, identityKey.privateKey);
}

/**
 * Safety Number for contact verification: SHA-512 over both identity keys,
 * ordered lexicographically so both sides compute the same value.
 */
export async function safetyNumber(
  identityA: Uint8Array,
  identityB: Uint8Array,
): Promise<string> {
  await ready();
  const [first, second] = compareBytes(identityA, identityB) <= 0
    ? [identityA, identityB]
    : [identityB, identityA];
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first, 0);
  joined.set(second, first.length);
  const digest = sodium.crypto_hash_sha512(joined);
  // Groups of 4 hex chars separated by spaces, 60 chars of entropy shown
  const hex = sodium.to_hex(digest).slice(0, 60);
  return hex.match(/.{1,4}/g)!.join(" ");
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}
