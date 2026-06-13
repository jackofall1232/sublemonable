// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/** Media types a message envelope may carry. The payload is always an opaque ciphertext. */
export type MediaType = "text" | "image" | "file";

export const PROTOCOL_VERSION = "1" as const;

/**
 * The wire format of a message. Everything the server relays is this shape;
 * `ciphertext` is the only content-bearing field and it is opaque to the server.
 */
export interface MessageEnvelope {
  /** UUID v4 */
  id: string;
  /** Sender account UUID */
  sender_id: string;
  /** Recipient account UUID */
  recipient_id: string;
  /** Base64-encoded ciphertext (AES-256-GCM, key from the Double Ratchet) */
  ciphertext: string;
  /** Base64 Curve25519 public key — present on X3DH initial messages only, null after */
  ephemeral_key: string | null;
  /** One-time prekey ID consumed by X3DH, null for established sessions */
  prekey_id: number | null;
  /** Ratchet counter within the current sending chain */
  message_number: number;
  /** Length of the previous sending chain (Double Ratchet header) */
  previous_chain_length: number;
  /** ISO 8601 UTC */
  timestamp: string;
  /** Self-destruct TTL in seconds; null means no self-destruct */
  ttl_seconds: number | null;
  /** Destroy everywhere immediately after first open */
  burn_on_read: boolean;
  media_type: MediaType;
  version: typeof PROTOCOL_VERSION;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MEDIA_TYPES: ReadonlySet<string> = new Set(["text", "image", "file"]);

/** Allowed disappearing-message TTL options, in seconds. */
export const TTL_OPTIONS_SECONDS = [30, 60, 300, 3600, 86400, 604800] as const;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Validate an untrusted value as a MessageEnvelope. Returns a typed envelope or
 * throws with a field-level reason (the reason never includes field *values*,
 * so it is safe to surface in logs that must stay content-free).
 */
export function parseEnvelope(value: unknown): MessageEnvelope {
  if (typeof value !== "object" || value === null) throw new EnvelopeError("envelope");
  const v = value as Record<string, unknown>;

  if (!isUuid(v.id)) throw new EnvelopeError("id");
  if (!isUuid(v.sender_id)) throw new EnvelopeError("sender_id");
  if (!isUuid(v.recipient_id)) throw new EnvelopeError("recipient_id");
  if (
    typeof v.ciphertext !== "string" ||
    v.ciphertext.length === 0 ||
    !BASE64_RE.test(v.ciphertext)
  )
    throw new EnvelopeError("ciphertext");
  if (
    v.ephemeral_key !== null &&
    (typeof v.ephemeral_key !== "string" || !BASE64_RE.test(v.ephemeral_key))
  )
    throw new EnvelopeError("ephemeral_key");
  if (
    v.prekey_id !== null &&
    (typeof v.prekey_id !== "number" || !Number.isInteger(v.prekey_id) || v.prekey_id < 0)
  )
    throw new EnvelopeError("prekey_id");
  if (
    typeof v.message_number !== "number" ||
    !Number.isInteger(v.message_number) ||
    v.message_number < 0
  )
    throw new EnvelopeError("message_number");
  if (
    typeof v.previous_chain_length !== "number" ||
    !Number.isInteger(v.previous_chain_length) ||
    v.previous_chain_length < 0
  )
    throw new EnvelopeError("previous_chain_length");
  if (typeof v.timestamp !== "string" || Number.isNaN(Date.parse(v.timestamp)))
    throw new EnvelopeError("timestamp");
  if (v.ttl_seconds !== null && (typeof v.ttl_seconds !== "number" || v.ttl_seconds <= 0))
    throw new EnvelopeError("ttl_seconds");
  if (typeof v.burn_on_read !== "boolean") throw new EnvelopeError("burn_on_read");
  if (typeof v.media_type !== "string" || !MEDIA_TYPES.has(v.media_type))
    throw new EnvelopeError("media_type");
  if (v.version !== PROTOCOL_VERSION) throw new EnvelopeError("version");

  return v as unknown as MessageEnvelope;
}

export function serializeEnvelope(envelope: MessageEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(raw: string): MessageEnvelope {
  return parseEnvelope(JSON.parse(raw));
}

/** Validation error naming only the offending field — never its value. */
export class EnvelopeError extends Error {
  constructor(public readonly field: string) {
    super(`invalid envelope field: ${field}`);
    this.name = "EnvelopeError";
  }
}
