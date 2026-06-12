// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/** Public half of a prekey bundle as served by GET /api/v1/users/:id/prekey. */
export interface PreKeyBundle {
  user_id: string;
  /** Base64 Curve25519 public identity key */
  identity_key: string;
  signed_prekey: {
    id: number;
    /** Base64 Curve25519 public key */
    public_key: string;
    /** Base64 Ed25519 signature by the identity key */
    signature: string;
  };
  /** Consumed server-side on fetch; null when the user's stock is empty */
  one_time_prekey: {
    id: number;
    public_key: string;
  } | null;
}

/** Body of POST /api/v1/register — public material only, by construction. */
export interface RegistrationRequest {
  identity_key: string;
  signed_prekey: {
    id: number;
    public_key: string;
    signature: string;
  };
  one_time_prekeys: Array<{ id: number; public_key: string }>;
}

/** Body of POST /api/v1/prekeys — replenish one-time prekey stock. */
export interface PreKeyUploadRequest {
  one_time_prekeys: Array<{ id: number; public_key: string }>;
}

/** Signed prekeys rotate on this interval. */
export const SIGNED_PREKEY_ROTATION_DAYS = 7;

/** One-time prekeys are uploaded in batches of this size. */
export const ONE_TIME_PREKEY_BATCH = 100;

/** Below this stock, the server emits `prekey.low`. */
export const PREKEY_LOW_WATERMARK = 20;
