// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

/**
 * Onion encryption for the multi-hop relay. A message is wrapped in one
 * encryption layer per relay in the circuit. Each relay can peel exactly one
 * layer — revealing only the next hop and an opaque inner packet — so no single
 * relay ever sees both where a packet came from and where it is ultimately going.
 *
 * Each layer is a libsodium sealed box (crypto_box_seal) to the relay's
 * Curve25519 public key. Sealed boxes are anonymous: the relay learns nothing
 * about who encrypted the layer, which is precisely the property onion routing
 * needs. Forward order of `hops` is [A (outermost), …, last (innermost)];
 * encryption is applied innermost-first so the client sends to hop A.
 *
 * Per-layer cleartext framing: addrLen(2, big-endian) || addr || innerPayload.
 * addrLen == 0 marks the innermost layer; its payload is the delivered content.
 */

import { sodium, ready } from "./sodium.js";
import { concat, utf8Encode, utf8Decode } from "./encoding.js";

/** A relay's Curve25519 (crypto_box) keypair. */
export interface RelayKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** A hop in a circuit: where to forward, and the key to wrap for it. */
export interface OnionHop {
  /** Opaque next-hop address (e.g. an .onion host or relay ID). */
  address: string;
  /** The hop's Curve25519 public key. */
  publicKey: Uint8Array;
}

/** Result of a relay peeling one onion layer. */
export interface PeeledLayer {
  /** Next hop to forward to, or null at the innermost layer. */
  nextHop: string | null;
  /** The inner packet to forward, or the delivered payload at the innermost layer. */
  payload: Uint8Array;
}

/** Generate a relay keypair for onion forwarding. */
export async function generateRelayKeyPair(): Promise<RelayKeyPair> {
  await ready();
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Build an onion: wrap `finalPayload` in one sealed-box layer per hop, applied
 * innermost-first. Returns the outermost packet the client sends to hop[0].
 * Requires at least one hop.
 */
export async function buildOnion(hops: readonly OnionHop[], finalPayload: Uint8Array): Promise<Uint8Array> {
  await ready();
  if (hops.length === 0) throw new Error("onion requires at least one hop");

  // Innermost layer: no next hop, payload is the delivered content.
  let layer = frameLayer(null, finalPayload);
  let packet = sodium.crypto_box_seal(layer, hops[hops.length - 1]!.publicKey);

  // Wrap outward: each enclosing layer names the hop the inner packet goes to.
  for (let i = hops.length - 2; i >= 0; i--) {
    layer = frameLayer(hops[i + 1]!.address, packet);
    packet = sodium.crypto_box_seal(layer, hops[i]!.publicKey);
  }
  return packet;
}

/**
 * Peel one onion layer with a relay's keypair. Returns the next hop (or null if
 * this was the innermost layer) and the inner packet/payload. Throws if the
 * packet was not sealed for this key.
 */
export async function peelOnion(keyPair: RelayKeyPair, packet: Uint8Array): Promise<PeeledLayer> {
  await ready();
  const opened = sodium.crypto_box_seal_open(packet, keyPair.publicKey, keyPair.privateKey);
  if (!opened) throw new Error("onion layer not sealed for this key");
  return unframeLayer(opened);
}

function frameLayer(address: string | null, payload: Uint8Array): Uint8Array {
  const addrBytes = address === null ? new Uint8Array(0) : utf8Encode(address);
  if (addrBytes.length > 0xffff) throw new Error("hop address too long");
  const header = new Uint8Array(2);
  header[0] = (addrBytes.length >>> 8) & 0xff;
  header[1] = addrBytes.length & 0xff;
  return concat(header, addrBytes, payload);
}

function unframeLayer(framed: Uint8Array): PeeledLayer {
  if (framed.length < 2) throw new Error("onion layer truncated");
  const addrLen = (framed[0]! << 8) | framed[1]!;
  if (framed.length < 2 + addrLen) throw new Error("onion layer truncated");
  const nextHop = addrLen === 0 ? null : utf8Decode(framed.slice(2, 2 + addrLen));
  return { nextHop, payload: framed.slice(2 + addrLen) };
}
