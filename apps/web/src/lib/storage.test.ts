// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Tests for the multi-vault image codec — the pure layer under the IndexedDB /
// Tauri backends. The load-bearing properties: the image is a constant size no
// matter how many vaults are real, every payload region is the same fixed
// size, and nothing stored distinguishes a real slot from random filler.

import { describe, expect, it } from "vitest";
import {
  addVaultSlot,
  createVaultSlots,
  randomBytes,
  randomSlot,
  SLOT_COUNT,
  tryPassphrase,
  type KeyDeriver,
  type KeySlot,
  type KeyStore,
} from "@sublemonable/crypto";
import {
  decodeImage,
  encodeImage,
  IMAGE_BYTES,
  openPayload,
  PAYLOAD_PLAINTEXT_BYTES,
  randomPayload,
  sealPayload,
  SLOT_PAYLOAD_BYTES,
  type VaultImage,
} from "./storage.js";

// Fast, deterministic stand-in for Argon2id (same trick as the vault tests in
// packages/crypto) so image tests don't pay 4 × 64 MiB derivations each.
const fastDeriver: KeyDeriver = async (pass, salt) => {
  const out = new Uint8Array(32);
  const seed = new TextEncoder().encode(pass);
  for (let i = 0; i < 32; i++) out[i] = (seed[i % seed.length] ?? 0) ^ salt[i % salt.length]!;
  return out;
};

function keyStoreFixture(sessionPayload = ""): KeyStore {
  return {
    version: 1,
    accountId: "00000000-0000-4000-8000-000000000000",
    identityKey: { publicKey: "pub", privateKey: "priv" },
    signedPrekeys: [],
    oneTimePrekeys: [],
    sessions: sessionPayload ? { peer: sessionPayload } : {},
    verifiedContacts: {},
  };
}

// Fast byte comparison — vitest's deep toEqual is far too slow on 256 KiB arrays.
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function fillerImage(): Promise<VaultImage> {
  const slots: KeySlot[] = [];
  const payloads: Uint8Array[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    slots.push(await randomSlot());
    payloads.push(randomPayload());
  }
  return { slots, payloads };
}

describe("vault image codec", () => {
  it("encodes to a constant size regardless of how many vaults are real", async () => {
    const empty = await fillerImage();
    expect(encodeImage(empty).length).toBe(IMAGE_BYTES);

    const oneVault = await fillerImage();
    const created = await createVaultSlots("first vault", fastDeriver);
    oneVault.slots = created.slots;
    oneVault.payloads[created.slotIndex] = await sealPayload(
      created.vaultKey,
      keyStoreFixture("x".repeat(10_000)),
    );
    expect(encodeImage(oneVault).length).toBe(IMAGE_BYTES);
  });

  it("round-trips slots and payloads byte-for-byte", async () => {
    const image = await fillerImage();
    const decoded = decodeImage(encodeImage(image));
    for (let i = 0; i < SLOT_COUNT; i++) {
      expect(equalBytes(decoded.slots[i]!.salt, image.slots[i]!.salt)).toBe(true);
      expect(equalBytes(decoded.slots[i]!.wrapped, image.slots[i]!.wrapped)).toBe(true);
      expect(equalBytes(decoded.payloads[i]!, image.payloads[i]!)).toBe(true);
    }
  });

  it("rejects anything that is not exactly a current-version image", async () => {
    // A legacy single-blob record, an empty buffer, a truncated image.
    expect(() => decodeImage(new Uint8Array(100))).toThrow();
    expect(() => decodeImage(new Uint8Array(0))).toThrow();
    expect(() => decodeImage(new Uint8Array(IMAGE_BYTES - 1))).toThrow();
    const wrongVersion = encodeImage(await fillerImage());
    wrongVersion[0] = 1;
    expect(() => decodeImage(wrongVersion)).toThrow();
  });
});

describe("payload sealing", () => {
  it("always produces exactly SLOT_PAYLOAD_BYTES, for tiny and large keystores", async () => {
    const key = await randomBytes(32);
    const tiny = await sealPayload(key, keyStoreFixture());
    const large = await sealPayload(key, keyStoreFixture("s".repeat(200_000)));
    expect(tiny.length).toBe(SLOT_PAYLOAD_BYTES);
    expect(large.length).toBe(SLOT_PAYLOAD_BYTES);
    // ...and matches the size of a filler region exactly.
    expect(randomPayload().length).toBe(SLOT_PAYLOAD_BYTES);
  });

  it("round-trips a keystore through seal/open", async () => {
    const key = await randomBytes(32);
    const keyStore = keyStoreFixture("session-state");
    const opened = await openPayload(key, await sealPayload(key, keyStore));
    expect(opened).toEqual(keyStore);
  });

  it("throws when the keystore exceeds slot capacity instead of leaking size", async () => {
    const key = await randomBytes(32);
    const oversized = keyStoreFixture("x".repeat(PAYLOAD_PLAINTEXT_BYTES));
    await expect(sealPayload(key, oversized)).rejects.toThrow(/capacity/);
  });

  it("refuses to open a payload with the wrong vault key", async () => {
    const sealed = await sealPayload(await randomBytes(32), keyStoreFixture());
    await expect(openPayload(await randomBytes(32), sealed)).rejects.toThrow();
    // A filler region never opens under any key.
    await expect(openPayload(await randomBytes(32), randomPayload())).rejects.toThrow();
  });
});

describe("end-to-end image unlock (sans worker/IndexedDB)", () => {
  it("stores two vaults in one image; each passphrase opens only its own keystore", async () => {
    const first = await createVaultSlots("alpha passphrase", fastDeriver);
    const second = await addVaultSlot(
      first.slots,
      new Set([first.slotIndex]),
      "bravo passphrase",
      fastDeriver,
    );
    const payloads: Uint8Array[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) payloads.push(randomPayload());

    const alphaStore = keyStoreFixture("alpha-sessions");
    const bravoStore = keyStoreFixture("bravo-sessions");
    payloads[first.slotIndex] = await sealPayload(first.vaultKey, alphaStore);
    payloads[second.slotIndex] = await sealPayload(second.vaultKey, bravoStore);
    const image = decodeImage(encodeImage({ slots: second.slots, payloads }));

    // Unlock exactly as unlockVault does, minus the Worker shell.
    const alpha = await tryPassphrase("alpha passphrase", image.slots, fastDeriver);
    const bravo = await tryPassphrase("bravo passphrase", image.slots, fastDeriver);
    expect(alpha).not.toBeNull();
    expect(bravo).not.toBeNull();
    expect(alpha!.slotIndex).not.toBe(bravo!.slotIndex);
    expect(await openPayload(alpha!.vaultKey, image.payloads[alpha!.slotIndex]!)).toEqual(
      alphaStore,
    );
    expect(await openPayload(bravo!.vaultKey, image.payloads[bravo!.slotIndex]!)).toEqual(
      bravoStore,
    );
    // Cross-keying never works: alpha's key cannot open bravo's payload.
    await expect(openPayload(alpha!.vaultKey, image.payloads[bravo!.slotIndex]!)).rejects.toThrow();

    expect(await tryPassphrase("wrong passphrase", image.slots, fastDeriver)).toBeNull();
  });
});
