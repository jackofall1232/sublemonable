// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

/**
 * Anonymous sealed box (libsodium crypto_box_seal) to a recipient's X25519 key.
 *
 * Used for Sealed Sender / dead-drop deposits: the ENTIRE message envelope —
 * including sender_id, recipient_id, timestamps, and ratchet headers — is sealed
 * to the recipient's identity key so the relay (and anyone who reads the stored
 * blob) sees only opaque bytes. Only the recipient, holding the matching X25519
 * private key, can open it. The sender is anonymous: a sealed box reveals nothing
 * about who created it.
 */

import { sodium, ready } from "./sodium.js";

/** Seal `message` to a recipient's X25519 public key. */
export async function sealTo(
  recipientX25519Public: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  await ready();
  if (recipientX25519Public.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error("recipient public key must be a 32-byte X25519 key");
  }
  return sodium.crypto_box_seal(message, recipientX25519Public);
}

/** Open a sealed box with the recipient's X25519 keypair. Throws if not for us. */
export async function openSealed(
  recipientX25519Public: Uint8Array,
  recipientX25519Private: Uint8Array,
  sealed: Uint8Array,
): Promise<Uint8Array> {
  await ready();
  const opened = sodium.crypto_box_seal_open(sealed, recipientX25519Public, recipientX25519Private);
  if (!opened) throw new Error("sealed box not addressed to this key");
  return opened;
}
