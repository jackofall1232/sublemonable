// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  EnvelopeError,
  deserializeEnvelope,
  parseEnvelope,
  serializeEnvelope,
  type MessageEnvelope,
} from "./envelope.js";

const valid: MessageEnvelope = {
  id: "0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a",
  sender_id: "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d",
  recipient_id: "9f8e7d6c-5b4a-4938-8271-605948372615",
  ciphertext: "c2VjcmV0IGJsb2I=",
  ephemeral_key: null,
  prekey_id: null,
  message_number: 4,
  previous_chain_length: 2,
  timestamp: "2026-06-12T10:00:00.000Z",
  ttl_seconds: 300,
  burn_on_read: false,
  media_type: "text",
  version: "1",
};

describe("parseEnvelope", () => {
  it("accepts a valid envelope", () => {
    expect(parseEnvelope(valid)).toEqual(valid);
  });

  it("round-trips through serialization", () => {
    expect(deserializeEnvelope(serializeEnvelope(valid))).toEqual(valid);
  });

  it.each([
    ["id", { ...valid, id: "not-a-uuid" }],
    ["ciphertext", { ...valid, ciphertext: "" }],
    ["ciphertext", { ...valid, ciphertext: "!!not base64!!" }],
    ["ephemeral_key", { ...valid, ephemeral_key: "***" }],
    ["prekey_id", { ...valid, prekey_id: -1 }],
    ["message_number", { ...valid, message_number: 1.5 }],
    ["timestamp", { ...valid, timestamp: "yesterday" }],
    ["ttl_seconds", { ...valid, ttl_seconds: 0 }],
    ["burn_on_read", { ...valid, burn_on_read: "yes" }],
    ["media_type", { ...valid, media_type: "video" }],
    ["version", { ...valid, version: "2" }],
  ])("rejects bad %s", (field, envelope) => {
    expect(() => parseEnvelope(envelope)).toThrowError(EnvelopeError);
    try {
      parseEnvelope(envelope);
    } catch (e) {
      expect((e as EnvelopeError).field).toBe(field);
    }
  });

  it("error message never echoes field values", () => {
    const evil = { ...valid, media_type: "TOP SECRET PLAINTEXT" };
    try {
      parseEnvelope(evil);
    } catch (e) {
      expect((e as Error).message).not.toContain("TOP SECRET");
    }
  });
});
