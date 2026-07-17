// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { parseReadReceipt, serializeReadReceipt } from "./receipts.js";

const ids = ["0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a", "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d"];

describe("read receipts", () => {
  it("round-trips through serialization", () => {
    const parsed = parseReadReceipt(serializeReadReceipt(ids));
    expect(parsed).not.toBeNull();
    expect(parsed?.message_ids).toEqual(ids);
  });

  it("treats ordinary message text as text, not a receipt", () => {
    expect(parseReadReceipt("hey, did you get my message?")).toBeNull();
    expect(parseReadReceipt("")).toBeNull();
  });

  it("treats JSON-looking text without the discriminator as text", () => {
    expect(parseReadReceipt('{"hello": "world"}')).toBeNull();
    expect(parseReadReceipt('{"v":1,"control":"receipt.unknown","message_ids":[]}')).toBeNull();
    expect(parseReadReceipt('{"v":2,"control":"receipt.read","message_ids":[]}')).toBeNull();
    expect(parseReadReceipt('{"control":"receipt.read","message_ids":[]}')).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(parseReadReceipt("{not json at all")).toBeNull();
    expect(parseReadReceipt('{"v":1,"control":"receipt.read"}')).toBeNull();
    expect(parseReadReceipt('{"v":1,"control":"receipt.read","message_ids":"nope"}')).toBeNull();
  });

  it("tolerates extra fields and filters non-string ids", () => {
    const raw = JSON.stringify({
      v: 1,
      control: "receipt.read",
      message_ids: [ids[0], 42, null, "", ids[1]],
      future_field: true,
    });
    expect(parseReadReceipt(raw)?.message_ids).toEqual(ids);
  });
});
