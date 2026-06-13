// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { utf8Decode, utf8Encode } from "./encoding.js";
import {
  addVaultSlot,
  createVaultSlots,
  randomSlot,
  SLOT_COUNT,
  tryPassphrase,
  WRAPPED_KEY_BYTES,
  type KeyDeriver,
  type KeySlot,
} from "./vault.js";
import { BLOCK_BYTES, pad, paddedBlockCount, unpad } from "./padding.js";
import {
  dropIdFromToken,
  generateDropToken,
  hasLeadingZeroBits,
  solveProofOfWork,
  verifyProofOfWork,
} from "./deaddrop.js";
import { buildOnion, generateRelayKeyPair, peelOnion, type OnionHop } from "./onion.js";

// A fast, deterministic stand-in for Argon2id so timing-parity structure can be
// asserted without paying the real KDF cost. It records every invocation.
function countingDeriver(): { deriver: KeyDeriver; calls: Array<{ pass: string }> } {
  const calls: Array<{ pass: string }> = [];
  const deriver: KeyDeriver = async (pass, salt) => {
    calls.push({ pass });
    const out = new Uint8Array(32);
    const seed = utf8Encode(pass);
    for (let i = 0; i < 32; i++) out[i] = (seed[i % seed.length] ?? 0) ^ salt[i % salt.length];
    return out;
  };
  return { deriver, calls };
}

describe("vault key slots", () => {
  it("a passphrase unlocks its own vault and nothing else", async () => {
    const { deriver } = countingDeriver();
    const { slots, vaultKey } = await createVaultSlots("primary passphrase", deriver);
    const ok = await tryPassphrase("primary passphrase", slots, deriver);
    expect(ok).not.toBeNull();
    expect(ok!.vaultKey).toEqual(vaultKey);
    expect(await tryPassphrase("not the passphrase", slots, deriver)).toBeNull();
  });

  it("always stores exactly SLOT_COUNT same-size slots — count is unknowable", async () => {
    const { deriver } = countingDeriver();
    const one = await createVaultSlots("only one vault", deriver);
    expect(one.slots).toHaveLength(SLOT_COUNT);
    for (const s of one.slots) {
      expect(s.wrapped).toHaveLength(WRAPPED_KEY_BYTES);
      expect(s.salt).toHaveLength(16);
    }
    // A disk image with two real vaults is shaped identically to one with one.
    const two = await addVaultSlot(one.slots, new Set([one.slotIndex]), "second vault", deriver);
    expect(two.slots).toHaveLength(SLOT_COUNT);
    for (const s of two.slots) expect(s.wrapped).toHaveLength(WRAPPED_KEY_BYTES);
  });

  it("two vaults are cryptographically separate — each key opens only its own", async () => {
    const { deriver } = countingDeriver();
    const first = await createVaultSlots("alpha", deriver);
    const second = await addVaultSlot(first.slots, new Set([first.slotIndex]), "bravo", deriver);

    const a = await tryPassphrase("alpha", second.slots, deriver);
    const b = await tryPassphrase("bravo", second.slots, deriver);
    expect(a!.vaultKey).toEqual(first.vaultKey);
    expect(b!.vaultKey).toEqual(second.vaultKey);
    expect(a!.vaultKey).not.toEqual(b!.vaultKey);
  });

  it("does identical work for any passphrase — no shortcut on any path", async () => {
    const { deriver, calls } = countingDeriver();
    const { slots } = await createVaultSlots("real one", deriver);

    calls.length = 0;
    await tryPassphrase("real one", slots, deriver); // matches a slot early or late
    const matched = calls.length;

    calls.length = 0;
    await tryPassphrase("totally wrong", slots, deriver); // matches nothing
    const missed = calls.length;

    // Both attempts derive a key for EVERY slot — equal work, equal timing.
    expect(matched).toBe(SLOT_COUNT);
    expect(missed).toBe(SLOT_COUNT);
  });

  it("filler slots are the size of real slots and never unlock", async () => {
    const { deriver } = countingDeriver();
    const filler: KeySlot[] = [await randomSlot(), await randomSlot()];
    expect(await tryPassphrase("anything", filler, deriver)).toBeNull();
  });
});

describe("256-byte padding", () => {
  it("pads to a multiple of the block size and round-trips", async () => {
    for (const len of [0, 1, 50, 252, 253, 256, 257, 1000]) {
      const msg = utf8Encode("x".repeat(len));
      const padded = await pad(msg);
      expect(padded.length % BLOCK_BYTES).toBe(0);
      expect(unpad(padded)).toEqual(msg);
    }
  });

  it("hides length — a short and a long message share a block size", async () => {
    const short = await pad(utf8Encode("ok"));
    const long = await pad(utf8Encode("x".repeat(200)));
    expect(short.length).toBe(long.length);
    expect(short.length).toBe(BLOCK_BYTES);
    expect(paddedBlockCount(2)).toBe(paddedBlockCount(200));
  });
});

describe("dead-drop tokens + proof of work", () => {
  it("drop ID is the SHA-256 of the token", async () => {
    const { token, dropId } = await generateDropToken();
    expect(token).toHaveLength(32);
    expect(dropId).toEqual(dropIdFromToken(token));
  });

  it("a solved puzzle verifies; a tampered one does not", async () => {
    const { dropId } = await generateDropToken();
    const difficulty = 8; // small for test speed
    const nonce = await solveProofOfWork(dropId, difficulty);
    expect(verifyProofOfWork(dropId, nonce, difficulty)).toBe(true);
    nonce[0] ^= 0xff;
    expect(verifyProofOfWork(dropId, nonce, difficulty)).toBe(false);
  });

  it("counts leading zero bits correctly", () => {
    expect(hasLeadingZeroBits(new Uint8Array([0x00, 0xff]), 8)).toBe(true);
    expect(hasLeadingZeroBits(new Uint8Array([0x00, 0xff]), 9)).toBe(false);
    expect(hasLeadingZeroBits(new Uint8Array([0x0f]), 4)).toBe(true);
    expect(hasLeadingZeroBits(new Uint8Array([0x1f]), 4)).toBe(false);
  });
});

describe("3-hop onion encryption", () => {
  it("delivers through three relays, each peeling exactly one layer", async () => {
    const a = await generateRelayKeyPair();
    const b = await generateRelayKeyPair();
    const c = await generateRelayKeyPair();
    const hops: OnionHop[] = [
      { address: "relay-b.onion", publicKey: a.publicKey },
      { address: "relay-c.onion", publicKey: b.publicKey },
      { address: "recipient", publicKey: c.publicKey },
    ];
    const message = utf8Encode("dead drop through three hops");
    const onion = await buildOnion(hops, message);

    const atA = await peelOnion(a, onion);
    expect(atA.nextHop).toBe("relay-c.onion");
    const atB = await peelOnion(b, atA.payload);
    expect(atB.nextHop).toBe("recipient");
    const atC = await peelOnion(c, atB.payload);
    expect(atC.nextHop).toBeNull(); // innermost — payload is delivered content
    expect(utf8Decode(atC.payload)).toBe("dead drop through three hops");
  });

  it("a relay cannot peel a layer sealed for a different relay", async () => {
    const a = await generateRelayKeyPair();
    const b = await generateRelayKeyPair();
    const wrong = await generateRelayKeyPair();
    const onion = await buildOnion(
      [
        { address: "b", publicKey: a.publicKey },
        { address: "end", publicKey: b.publicKey },
      ],
      utf8Encode("secret"),
    );
    // Relay B's middle layer is opaque to anyone but the holder of B's key.
    const atA = await peelOnion(a, onion);
    await expect(peelOnion(wrong, atA.payload)).rejects.toThrow();
  });
});
