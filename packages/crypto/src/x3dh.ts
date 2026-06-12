// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { sodium, ready } from "./sodium.js";
import { concat } from "./encoding.js";
import { hkdf } from "./kdf.js";
import {
  identityKeyToX25519,
  verifySignedPrekey,
  type IdentityKeyPair,
  type OneTimePrekey,
  type SignedPrekey,
} from "./keys.js";
import { initRatchetAsInitiator, initRatchetAsResponder, type RatchetSession } from "./ratchet.js";

const X3DH_INFO = "Sublemonable-X3DH-v1";

/** Peer's prekey bundle, decoded to raw bytes (fetched from the server). */
export interface DecodedPreKeyBundle {
  /** Ed25519 public identity key */
  identityKey: Uint8Array;
  signedPrekey: { id: number; publicKey: Uint8Array; signature: Uint8Array };
  oneTimePrekey: { id: number; publicKey: Uint8Array } | null;
}

export interface X3DHInitiationResult {
  session: RatchetSession;
  /** Send in the envelope's ephemeral_key field on the first message */
  ephemeralPublicKey: Uint8Array;
  /** Send in the envelope's prekey_id field, null if no OPK was available */
  usedPrekeyId: number | null;
}

/**
 * X3DH as the session initiator (Alice). Verifies the signed prekey's
 * signature before any DH — an unverified bundle is rejected outright.
 *
 *   DH1 = DH(IK_A,  SPK_B)
 *   DH2 = DH(EK_A,  IK_B)
 *   DH3 = DH(EK_A,  SPK_B)
 *   DH4 = DH(EK_A,  OPK_B)        — when a one-time prekey is available
 *   SK  = HKDF(F || DH1..DH4)     — F = 32 bytes of 0xFF (per the X3DH spec)
 */
export async function x3dhInitiate(
  myIdentityKey: IdentityKeyPair,
  theirPreKeyBundle: DecodedPreKeyBundle,
): Promise<X3DHInitiationResult> {
  await ready();
  const { identityKey, signedPrekey, oneTimePrekey } = theirPreKeyBundle;

  const valid = await verifySignedPrekey(signedPrekey.publicKey, signedPrekey.signature, identityKey);
  if (!valid) throw new Error("prekey bundle signature verification failed");

  const theirIdentityX = await identityKeyToX25519(identityKey);
  const ephemeral = sodium.crypto_box_keypair();

  const dh1 = sodium.crypto_scalarmult(myIdentityKey.x25519PrivateKey, signedPrekey.publicKey);
  const dh2 = sodium.crypto_scalarmult(ephemeral.privateKey, theirIdentityX);
  const dh3 = sodium.crypto_scalarmult(ephemeral.privateKey, signedPrekey.publicKey);
  const parts = [new Uint8Array(32).fill(0xff), dh1, dh2, dh3];
  if (oneTimePrekey) {
    parts.push(sodium.crypto_scalarmult(ephemeral.privateKey, oneTimePrekey.publicKey));
  }

  const sk = await hkdf(concat(...parts), new Uint8Array(32), X3DH_INFO, 32);
  zero(dh1, dh2, dh3, ephemeral.privateKey);

  const session = await initRatchetAsInitiator(sk, signedPrekey.publicKey);
  return {
    session,
    ephemeralPublicKey: ephemeral.publicKey,
    usedPrekeyId: oneTimePrekey?.id ?? null,
  };
}

/**
 * X3DH as the responder (Bob), on receiving an initial message that carries
 * the initiator's ephemeral key. The consumed one-time prekey's private half
 * must be deleted by the caller after this returns — it is single-use.
 */
export async function x3dhRespond(
  myIdentityKey: IdentityKeyPair,
  mySignedPrekey: SignedPrekey,
  myOneTimePrekey: OneTimePrekey | null,
  theirIdentityKey: Uint8Array,
  theirEphemeralKey: Uint8Array,
): Promise<RatchetSession> {
  await ready();
  const theirIdentityX = await identityKeyToX25519(theirIdentityKey);

  const dh1 = sodium.crypto_scalarmult(mySignedPrekey.privateKey, theirIdentityX);
  const dh2 = sodium.crypto_scalarmult(myIdentityKey.x25519PrivateKey, theirEphemeralKey);
  const dh3 = sodium.crypto_scalarmult(mySignedPrekey.privateKey, theirEphemeralKey);
  const parts = [new Uint8Array(32).fill(0xff), dh1, dh2, dh3];
  if (myOneTimePrekey) {
    parts.push(sodium.crypto_scalarmult(myOneTimePrekey.privateKey, theirEphemeralKey));
  }

  const sk = await hkdf(concat(...parts), new Uint8Array(32), X3DH_INFO, 32);
  zero(dh1, dh2, dh3);

  return initRatchetAsResponder(sk, {
    publicKey: mySignedPrekey.publicKey,
    privateKey: mySignedPrekey.privateKey,
  });
}

function zero(...buffers: Uint8Array[]): void {
  for (const b of buffers) sodium.memzero(b);
}
