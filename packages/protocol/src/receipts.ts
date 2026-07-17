// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Read receipts — encrypted control payloads carried INSIDE the plaintext of
 * an ordinary message envelope (`message.send`, media_type "text", no TTL, no
 * burn flag). On the wire a receipt is indistinguishable from conversation
 * text, which is the whole point: the relay never learns read status, not
 * even that a receipt exists. A dedicated frame type (the way `message.burn`
 * works) would leak exactly when messages are read; riding `message.send`
 * also gives receipts the same store-and-forward guarantee as messages, so a
 * sender who is offline when their message is read still receives the
 * receipt on reconnect.
 *
 * Clients recognize receipts AFTER decryption, by the discriminator below,
 * and must never render a recognized receipt as message text. Burn-on-read
 * messages never produce a receipt — their propagated burn signal is the
 * read confirmation.
 *
 * Parsing is strict on the discriminator (`v` AND `control` must both match)
 * and lenient on extra fields, so future revisions can extend the payload
 * without old clients mistaking receipts for text.
 */

export const CONTROL_VERSION = 1 as const;
export const READ_RECEIPT_CONTROL = "receipt.read" as const;

export interface ReadReceiptPayload {
  v: typeof CONTROL_VERSION;
  control: typeof READ_RECEIPT_CONTROL;
  /** Envelope ids of the messages that were read (batched per chat-open). */
  message_ids: string[];
}

/** Serializes a read receipt for the given envelope ids. */
export function serializeReadReceipt(messageIds: string[]): string {
  return JSON.stringify({
    v: CONTROL_VERSION,
    control: READ_RECEIPT_CONTROL,
    message_ids: messageIds,
  });
}

/**
 * Returns the payload when decrypted plaintext is a read receipt, or null for
 * a regular message to display. Never throws on malformed input — anything
 * that isn't unambiguously a receipt is conversation text.
 */
export function parseReadReceipt(plaintext: string): ReadReceiptPayload | null {
  if (!plaintext.startsWith("{")) return null;
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== CONTROL_VERSION || v.control !== READ_RECEIPT_CONTROL) return null;
  if (!Array.isArray(v.message_ids)) return null;
  const ids = v.message_ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  return { v: CONTROL_VERSION, control: READ_RECEIPT_CONTROL, message_ids: ids };
}
