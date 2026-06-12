// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { IdentityKeyPair, OneTimePrekey, RatchetSession, SignedPrekey } from "@sublemonable/crypto";
import { b64, unb64 } from "./bytes.js";

/** JSON-safe form of a Double Ratchet session for the encrypted keystore. */
export interface SerializedSession {
  rootKey: string;
  dhSelfPublic: string;
  dhSelfPrivate: string;
  dhRemote: string | null;
  sendingChainKey: string | null;
  receivingChainKey: string | null;
  sendCounter: number;
  receiveCounter: number;
  previousSendCounter: number;
  skippedKeys: Array<[string, string]>;
}

export function serializeSession(s: RatchetSession): SerializedSession {
  return {
    rootKey: b64(s.rootKey),
    dhSelfPublic: b64(s.dhSelf.publicKey),
    dhSelfPrivate: b64(s.dhSelf.privateKey),
    dhRemote: s.dhRemote ? b64(s.dhRemote) : null,
    sendingChainKey: s.sendingChainKey ? b64(s.sendingChainKey) : null,
    receivingChainKey: s.receivingChainKey ? b64(s.receivingChainKey) : null,
    sendCounter: s.sendCounter,
    receiveCounter: s.receiveCounter,
    previousSendCounter: s.previousSendCounter,
    skippedKeys: [...s.skippedKeys.entries()].map(([k, v]) => [k, b64(v)]),
  };
}

export function deserializeSession(s: SerializedSession): RatchetSession {
  return {
    rootKey: unb64(s.rootKey),
    dhSelf: { publicKey: unb64(s.dhSelfPublic), privateKey: unb64(s.dhSelfPrivate) },
    dhRemote: s.dhRemote ? unb64(s.dhRemote) : null,
    sendingChainKey: s.sendingChainKey ? unb64(s.sendingChainKey) : null,
    receivingChainKey: s.receivingChainKey ? unb64(s.receivingChainKey) : null,
    sendCounter: s.sendCounter,
    receiveCounter: s.receiveCounter,
    previousSendCounter: s.previousSendCounter,
    skippedKeys: new Map(s.skippedKeys.map(([k, v]) => [k, unb64(v)])),
  };
}

export interface SerializedIdentity {
  publicKey: string;
  privateKey: string;
  x25519PublicKey: string;
  x25519PrivateKey: string;
}

export function serializeIdentity(k: IdentityKeyPair): SerializedIdentity {
  return {
    publicKey: b64(k.publicKey),
    privateKey: b64(k.privateKey),
    x25519PublicKey: b64(k.x25519PublicKey),
    x25519PrivateKey: b64(k.x25519PrivateKey),
  };
}

export function deserializeIdentity(k: SerializedIdentity): IdentityKeyPair {
  return {
    publicKey: unb64(k.publicKey),
    privateKey: unb64(k.privateKey),
    x25519PublicKey: unb64(k.x25519PublicKey),
    x25519PrivateKey: unb64(k.x25519PrivateKey),
  };
}

export interface SerializedSignedPrekey {
  id: number;
  publicKey: string;
  privateKey: string;
  signature: string;
  createdAt: number;
}

export function serializeSignedPrekey(p: SignedPrekey): SerializedSignedPrekey {
  return {
    id: p.id,
    publicKey: b64(p.publicKey),
    privateKey: b64(p.privateKey),
    signature: b64(p.signature),
    createdAt: p.createdAt,
  };
}

export function deserializeSignedPrekey(p: SerializedSignedPrekey): SignedPrekey {
  return {
    id: p.id,
    publicKey: unb64(p.publicKey),
    privateKey: unb64(p.privateKey),
    signature: unb64(p.signature),
    createdAt: p.createdAt,
  };
}

export interface SerializedOneTimePrekey {
  id: number;
  publicKey: string;
  privateKey: string;
}

export function serializeOneTimePrekey(p: OneTimePrekey): SerializedOneTimePrekey {
  return { id: p.id, publicKey: b64(p.publicKey), privateKey: b64(p.privateKey) };
}

export function deserializeOneTimePrekey(p: SerializedOneTimePrekey): OneTimePrekey {
  return { id: p.id, publicKey: unb64(p.publicKey), privateKey: unb64(p.privateKey) };
}
