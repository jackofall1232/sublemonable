// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Dead-drop wire types (v1.5). A dead drop carries an opaque encrypted envelope
 * deposited under a hashed drop ID with no sender field anywhere. Deposit needs
 * no account — a hashcash proof-of-work stands in for auth. Redemption presents
 * the token preimage and destroys the drop. Neither operation reveals who is on
 * the other end.
 */

/** A drop lives this long whether collected or not, then is destroyed. */
export const DROP_TTL_HOURS = 72;

/**
 * POST /api/v1/drops — deposit an encrypted envelope. No authentication; the
 * proof-of-work nonce is the only admission control. There is deliberately no
 * sender field: the relay cannot know who deposited.
 */
export interface DropDepositRequest {
  /** Base64 SHA-256(token) — the public drop ID the envelope is stored under. */
  drop_id: string;
  /** Base64 opaque encrypted envelope (Signal Protocol ciphertext, padded). */
  ciphertext: string;
  /** Base64 8-byte hashcash nonce solving the PoW puzzle over drop_id. */
  pow_nonce: string;
}

export interface DropDepositResponse {
  /** ISO 8601 UTC — when the drop self-destructs if uncollected. */
  expires_at: string;
}

/**
 * POST /api/v1/drops/redeem — present the token; receive the envelope; the drop
 * is destroyed in the same operation. A second attempt with the same token
 * returns 404 (single-use). No account required.
 */
export interface DropRedeemRequest {
  /** Base64 256-bit token (the out-of-band secret). */
  token: string;
}

export interface DropRedeemResponse {
  /** Base64 opaque encrypted envelope. */
  ciphertext: string;
}

/** Difficulty (leading zero bits) the relay requires on deposit proof-of-work. */
export const DROP_POW_DIFFICULTY = 20;
