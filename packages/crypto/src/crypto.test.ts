// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { aeadDecrypt, aeadEncrypt } from "./aead.js";
import { utf8Decode, utf8Encode } from "./encoding.js";
import { deriveKeyFromPassword, generateSalt } from "./kdf.js";
import {
  generateIdentityKeyPair,
  generateOneTimePrekeys,
  generateSignedPrekey,
  safetyNumber,
  verifySignedPrekey,
} from "./keys.js";
import { decryptKeyStore, encryptKeyStore, type KeyStore } from "./keystore.js";
import { ratchetDecrypt, ratchetEncrypt } from "./ratchet.js";
import { decodeWatermarkPayload, embedWatermarkBits, extractWatermarkBits } from "./watermark.js";
import { x3dhInitiate, x3dhRespond } from "./x3dh.js";

async function establishedSessions() {
  const alice = await generateIdentityKeyPair();
  const bob = await generateIdentityKeyPair();
  const bobSigned = await generateSignedPrekey(bob, 1);
  const [bobOneTime] = await generateOneTimePrekeys(1);

  const init = await x3dhInitiate(alice, {
    identityKey: bob.publicKey,
    signedPrekey: {
      id: bobSigned.id,
      publicKey: bobSigned.publicKey,
      signature: bobSigned.signature,
    },
    oneTimePrekey: { id: bobOneTime!.id, publicKey: bobOneTime!.publicKey },
  });
  const bobSession = await x3dhRespond(
    bob,
    bobSigned,
    bobOneTime!,
    alice.publicKey,
    init.ephemeralPublicKey,
  );
  return { aliceSession: init.session, bobSession };
}

describe("AEAD", () => {
  it("round-trips and produces unique nonces per call", async () => {
    const key = new Uint8Array(32).fill(7);
    const pt = utf8Encode("read it. it's gone.");
    const a = await aeadEncrypt(key, pt);
    const b = await aeadEncrypt(key, pt);
    expect(a).not.toEqual(b); // fresh nonce every call
    expect(utf8Decode(await aeadDecrypt(key, a))).toBe("read it. it's gone.");
  });

  it("rejects tampered ciphertext", async () => {
    const key = new Uint8Array(32).fill(7);
    const box = await aeadEncrypt(key, utf8Encode("hi"));
    box[box.length - 1]! ^= 0xff;
    await expect(aeadDecrypt(key, box)).rejects.toThrow();
  });
});

describe("prekeys", () => {
  it("signed prekey verifies against identity key, fails against another", async () => {
    const id = await generateIdentityKeyPair();
    const other = await generateIdentityKeyPair();
    const spk = await generateSignedPrekey(id, 1);
    expect(await verifySignedPrekey(spk.publicKey, spk.signature, id.publicKey)).toBe(true);
    expect(await verifySignedPrekey(spk.publicKey, spk.signature, other.publicKey)).toBe(false);
  });

  it("safety number is symmetric and formatted in groups of 4", async () => {
    const a = await generateIdentityKeyPair();
    const b = await generateIdentityKeyPair();
    const ab = await safetyNumber(a.publicKey, b.publicKey);
    const ba = await safetyNumber(b.publicKey, a.publicKey);
    expect(ab).toBe(ba);
    expect(ab).toMatch(/^([0-9a-f]{4} )+[0-9a-f]{4}$/);
  });
});

describe("X3DH + Double Ratchet", () => {
  it("both sides derive a working session", async () => {
    const { aliceSession, bobSession } = await establishedSessions();
    const msg = await ratchetEncrypt(aliceSession, utf8Encode("hello bob"));
    expect(utf8Decode(await ratchetDecrypt(bobSession, msg))).toBe("hello bob");
  });

  it("ratchets across many turns in both directions", async () => {
    const { aliceSession, bobSession } = await establishedSessions();
    for (let turn = 0; turn < 6; turn++) {
      const [tx, rx] = turn % 2 === 0 ? [aliceSession, bobSession] : [bobSession, aliceSession];
      for (let i = 0; i < 3; i++) {
        const text = `turn ${turn} msg ${i}`;
        const enc = await ratchetEncrypt(tx, utf8Encode(text));
        expect(utf8Decode(await ratchetDecrypt(rx, enc))).toBe(text);
      }
    }
  });

  it("handles out-of-order delivery via skipped message keys", async () => {
    const { aliceSession, bobSession } = await establishedSessions();
    const m1 = await ratchetEncrypt(aliceSession, utf8Encode("first"));
    const m2 = await ratchetEncrypt(aliceSession, utf8Encode("second"));
    const m3 = await ratchetEncrypt(aliceSession, utf8Encode("third"));
    expect(utf8Decode(await ratchetDecrypt(bobSession, m3))).toBe("third");
    expect(utf8Decode(await ratchetDecrypt(bobSession, m1))).toBe("first");
    expect(utf8Decode(await ratchetDecrypt(bobSession, m2))).toBe("second");
  });

  it("rejects a bundle with a forged prekey signature", async () => {
    const alice = await generateIdentityKeyPair();
    const bob = await generateIdentityKeyPair();
    const mallory = await generateIdentityKeyPair();
    const forged = await generateSignedPrekey(mallory, 1); // signed by the wrong identity
    await expect(
      x3dhInitiate(alice, {
        identityKey: bob.publicKey,
        signedPrekey: { id: 1, publicKey: forged.publicKey, signature: forged.signature },
        oneTimePrekey: null,
      }),
    ).rejects.toThrow(/signature/);
  });
});

describe("keystore", () => {
  it("encrypts at rest and fails closed on a wrong passphrase", async () => {
    const salt = await generateSalt();
    const key = await deriveKeyFromPassword("correct horse battery lemon", salt);
    const store: KeyStore = {
      version: 1,
      accountId: "0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a",
      identityKey: { publicKey: "aa", privateKey: "bb" },
      signedPrekeys: [],
      oneTimePrekeys: [],
      sessions: {},
      verifiedContacts: {},
    };
    const blob = await encryptKeyStore(key, store);
    expect(await decryptKeyStore(key, blob)).toEqual(store);

    const wrong = await deriveKeyFromPassword("wrong passphrase", salt);
    await expect(decryptKeyStore(wrong, blob)).rejects.toThrow();
  });
});

describe("watermark", () => {
  it("embeds and extracts a payload from pixel data", () => {
    const pixels = new Uint8ClampedArray(256 * 64 * 4).fill(0x24);
    const payload = utf8Encode(
      JSON.stringify({ userId: "u-1", messageId: "m-1", timestamp: "2026-06-12T00:00:00Z" }),
    );
    embedWatermarkBits(pixels, payload);
    const extracted = extractWatermarkBits(pixels);
    expect(extracted).not.toBeNull();
    expect(decodeWatermarkPayload(extracted!)).toEqual({
      userId: "u-1",
      messageId: "m-1",
      timestamp: "2026-06-12T00:00:00Z",
    });
  });

  it("is visually invisible — pixel deltas are at most 1 LSB", () => {
    const before = new Uint8ClampedArray(64 * 64 * 4).fill(0x42);
    const after = new Uint8ClampedArray(before);
    embedWatermarkBits(after, utf8Encode("leak-attribution"));
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(after[i]! - before[i]!)).toBeLessThanOrEqual(1);
    }
  });

  it("returns null when no watermark is present", () => {
    expect(extractWatermarkBits(new Uint8ClampedArray(64 * 64 * 4))).toBeNull();
  });

  it("returns null on pixel buffers too small to hold a header", () => {
    expect(extractWatermarkBits(new Uint8ClampedArray(0))).toBeNull();
    expect(extractWatermarkBits(new Uint8ClampedArray(31))).toBeNull();
  });
});
