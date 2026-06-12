// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Double Ratchet (Signal specification) over X25519 + HKDF-SHA-256 +
 * AES-256-GCM. Message keys are derived per message and discarded after use;
 * a DH ratchet step runs on every change of sending direction, giving forward
 * secrecy and post-compromise security.
 *
 * Wire note: the envelope schema reserves `ephemeral_key` for X3DH only, so
 * the per-message ratchet header travels *prepended to the ciphertext blob*:
 *
 *   blob = ratchet_public_key(32) || nonce(12) || aead_ciphertext
 *
 * The header (ratchet key + counters) is authenticated as AEAD associated data.
 */

import { sodium, ready } from "./sodium.js";
import { concat } from "./encoding.js";
import { hkdf } from "./kdf.js";
import { aeadDecrypt, aeadEncrypt, NONCE_BYTES } from "./aead.js";

const ROOT_INFO = "Sublemonable-Ratchet-Root-v1";
const KEY_BYTES = 32;
/** Bound on skipped message keys we are willing to derive and cache. */
const MAX_SKIP = 1000;

interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface RatchetSession {
  rootKey: Uint8Array;
  /** Our current ratchet keypair */
  dhSelf: KeyPair;
  /** Peer's current ratchet public key, null until their first message */
  dhRemote: Uint8Array | null;
  sendingChainKey: Uint8Array | null;
  receivingChainKey: Uint8Array | null;
  /** Messages sent in the current sending chain */
  sendCounter: number;
  /** Messages received in the current receiving chain */
  receiveCounter: number;
  /** Length of the previous sending chain */
  previousSendCounter: number;
  /** Cached keys for out-of-order messages: "ratchetPubB64:n" → message key */
  skippedKeys: Map<string, Uint8Array>;
}

export interface EncryptedMessage {
  /** ratchet_pub || nonce || ciphertext+tag */
  blob: Uint8Array;
  messageNumber: number;
  previousChainLength: number;
}

/** Initiator (Alice): can send immediately; receiving chain starts on Bob's first reply. */
export async function initRatchetAsInitiator(
  sharedSecret: Uint8Array,
  theirSignedPrekeyPublic: Uint8Array,
): Promise<RatchetSession> {
  await ready();
  const dhSelf = sodium.crypto_box_keypair();
  const [rootKey, sendingChainKey] = await kdfRoot(
    sharedSecret,
    sodium.crypto_scalarmult(dhSelf.privateKey, theirSignedPrekeyPublic),
  );
  return {
    rootKey,
    dhSelf,
    dhRemote: theirSignedPrekeyPublic,
    sendingChainKey,
    receivingChainKey: null,
    sendCounter: 0,
    receiveCounter: 0,
    previousSendCounter: 0,
    skippedKeys: new Map(),
  };
}

/** Responder (Bob): seeded with the signed prekey pair; chains start on first receive. */
export async function initRatchetAsResponder(
  sharedSecret: Uint8Array,
  signedPrekeyPair: KeyPair,
): Promise<RatchetSession> {
  await ready();
  return {
    rootKey: sharedSecret,
    dhSelf: signedPrekeyPair,
    dhRemote: null,
    sendingChainKey: null,
    receivingChainKey: null,
    sendCounter: 0,
    receiveCounter: 0,
    previousSendCounter: 0,
    skippedKeys: new Map(),
  };
}

export async function ratchetEncrypt(
  session: RatchetSession,
  plaintext: Uint8Array,
): Promise<EncryptedMessage> {
  await ready();
  if (!session.sendingChainKey) {
    // Responder sending first: perform our half of the DH ratchet
    if (!session.dhRemote) throw new Error("cannot send before session established");
    await dhRatchetSendStep(session);
  }
  const messageKey = await advanceChain(session, "sending");
  const messageNumber = session.sendCounter;
  session.sendCounter += 1;

  const header = makeHeader(session.dhSelf.publicKey, messageNumber, session.previousSendCounter);
  const box = await aeadEncrypt(messageKey, plaintext, header);
  sodium.memzero(messageKey);

  return {
    blob: concat(session.dhSelf.publicKey, box),
    messageNumber,
    previousChainLength: session.previousSendCounter,
  };
}

export async function ratchetDecrypt(
  session: RatchetSession,
  message: EncryptedMessage,
): Promise<Uint8Array> {
  await ready();
  if (message.blob.length < KEY_BYTES + NONCE_BYTES + 16) throw new Error("message too short");
  const theirRatchetKey = message.blob.slice(0, KEY_BYTES);
  const box = message.blob.slice(KEY_BYTES);
  const header = makeHeader(theirRatchetKey, message.messageNumber, message.previousChainLength);

  // Out-of-order message from an older chain?
  const skippedId = skipId(theirRatchetKey, message.messageNumber);
  const cached = session.skippedKeys.get(skippedId);
  if (cached) {
    session.skippedKeys.delete(skippedId);
    const plaintext = await aeadDecrypt(cached, box, header);
    sodium.memzero(cached);
    return plaintext;
  }

  // New remote ratchet key → close out the old receiving chain, DH ratchet forward
  if (!session.dhRemote || !sodium.memcmp(theirRatchetKey, session.dhRemote)) {
    await cacheSkippedKeys(session, message.previousChainLength);
    await dhRatchetReceiveStep(session, theirRatchetKey);
  }
  await cacheSkippedKeys(session, message.messageNumber);

  const messageKey = await advanceChain(session, "receiving");
  session.receiveCounter += 1;
  const plaintext = await aeadDecrypt(messageKey, box, header);
  sodium.memzero(messageKey);
  return plaintext;
}

// ── internals ────────────────────────────────────────────────────────────────

/** KDF_RK: (rootKey, dhOutput) → 64 bytes split into (rootKey', chainKey). */
async function kdfRoot(rootKey: Uint8Array, dhOutput: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const okm = await hkdf(dhOutput, rootKey, ROOT_INFO, 64);
  sodium.memzero(dhOutput);
  return [okm.slice(0, KEY_BYTES), okm.slice(KEY_BYTES)];
}

/** KDF_CK: messageKey = HMAC(ck, 0x01); nextChainKey = HMAC(ck, 0x02). */
async function advanceChain(
  session: RatchetSession,
  direction: "sending" | "receiving",
): Promise<Uint8Array> {
  const key = direction === "sending" ? "sendingChainKey" : "receivingChainKey";
  const chainKey = session[key];
  if (!chainKey) throw new Error(`no ${direction} chain established`);
  const messageKey = sodium.crypto_auth_hmacsha256(new Uint8Array([0x01]), chainKey);
  session[key] = sodium.crypto_auth_hmacsha256(new Uint8Array([0x02]), chainKey);
  sodium.memzero(chainKey);
  return messageKey;
}

/** Receiving side of the DH ratchet: new remote key arrived. */
async function dhRatchetReceiveStep(session: RatchetSession, theirRatchetKey: Uint8Array): Promise<void> {
  session.dhRemote = theirRatchetKey;
  session.previousSendCounter = session.sendCounter;
  session.sendCounter = 0;
  session.receiveCounter = 0;
  const [rk, ckRecv] = await kdfRoot(
    session.rootKey,
    sodium.crypto_scalarmult(session.dhSelf.privateKey, theirRatchetKey),
  );
  session.rootKey = rk;
  session.receivingChainKey = ckRecv;
  // Immediately rotate our own ratchet key for the reply direction
  await dhRatchetSendStep(session);
}

/** Sending side: rotate our ratchet keypair and derive a fresh sending chain. */
async function dhRatchetSendStep(session: RatchetSession): Promise<void> {
  if (!session.dhRemote) throw new Error("no remote ratchet key");
  session.dhSelf = sodium.crypto_box_keypair();
  const [rk, ckSend] = await kdfRoot(
    session.rootKey,
    sodium.crypto_scalarmult(session.dhSelf.privateKey, session.dhRemote),
  );
  session.rootKey = rk;
  session.sendingChainKey = ckSend;
}

/** Derive and cache message keys for messages we haven't seen yet in the current chain. */
async function cacheSkippedKeys(session: RatchetSession, until: number): Promise<void> {
  if (!session.receivingChainKey || !session.dhRemote) return;
  if (until - session.receiveCounter > MAX_SKIP) throw new Error("too many skipped messages");
  while (session.receiveCounter < until) {
    const mk = await advanceChain(session, "receiving");
    session.skippedKeys.set(skipId(session.dhRemote, session.receiveCounter), mk);
    session.receiveCounter += 1;
    if (session.skippedKeys.size > MAX_SKIP) {
      const oldest = session.skippedKeys.keys().next().value!;
      sodium.memzero(session.skippedKeys.get(oldest)!);
      session.skippedKeys.delete(oldest);
    }
  }
}

function makeHeader(ratchetKey: Uint8Array, n: number, pn: number): Uint8Array {
  const counters = new Uint8Array(8);
  new DataView(counters.buffer).setUint32(0, n);
  new DataView(counters.buffer).setUint32(4, pn);
  return concat(ratchetKey, counters);
}

function skipId(ratchetKey: Uint8Array, n: number): string {
  return `${sodium.to_base64(ratchetKey, sodium.base64_variants.ORIGINAL)}:${n}`;
}
