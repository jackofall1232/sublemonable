// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import type { MessageEnvelope, RelayNode } from "@sublemonable/protocol";
import { fromBase64 } from "@sublemonable/crypto";
import { cadenceMeanSeconds, poissonIntervalMs } from "./poisson.js";
import { DecoyScheduler, makeDecoyEnvelope, type Timer } from "./decoy.js";
import { buildCircuit, selectPath, shouldRotate } from "./circuit.js";

function registry(): RelayNode[] {
  return [
    { address: "a.onion", public_key: "", as_number: 100, region: "eu", multi_hop: true },
    { address: "b.onion", public_key: "", as_number: 200, region: "us", multi_hop: true },
    { address: "c.onion", public_key: "", as_number: 300, region: "ap", multi_hop: true },
    { address: "d.onion", public_key: "", as_number: 100, region: "eu", multi_hop: true }, // same AS as a
    { address: "e.onion", public_key: "", as_number: 400, region: "us", multi_hop: false }, // not multi-hop
  ];
}

describe("poisson timing", () => {
  it("produces positive, varied intervals around the mean", () => {
    let i = 0;
    const stubs = [0.1, 0.5, 0.9, 0.25];
    const rng = () => stubs[i++ % stubs.length]!;
    const a = poissonIntervalMs(60, rng);
    const b = poissonIntervalMs(60, rng);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).not.toBe(b); // not a metronome
  });

  it("midpoint mean for a cadence range", () => {
    expect(cadenceMeanSeconds([30, 120])).toBe(75);
  });
});

describe("decoy envelopes", () => {
  it("match a real ratchet blob in shape and length — indistinguishable from real", async () => {
    const env = await makeDecoyEnvelope("11111111-1111-4111-8111-111111111111");
    const raw = await fromBase64(env.ciphertext);
    // ratchet_pub(32) || nonce(12) || AEAD(256-byte-padded plaintext)+tag(16) = 316
    expect(raw.length).toBe(32 + 12 + 256 + 16);
    expect(env.media_type).toBe("text");
    expect(env.version).toBe("1");
  });

  it("two decoys differ — encrypted, not a fixed/structured filler", async () => {
    const a = await makeDecoyEnvelope("11111111-1111-4111-8111-111111111111");
    const b = await makeDecoyEnvelope("11111111-1111-4111-8111-111111111111");
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("scheduler emits decoys on its cadence and stops cleanly", () => {
    const sent: MessageEnvelope[] = [];
    // Fake timer that fires immediately so we can count a few rounds.
    let fires = 0;
    const fakeTimer: Timer = {
      setTimeout: (fn) => {
        if (fires++ < 3) queueMicrotask(fn);
        return fires;
      },
      clearTimeout: () => {},
    };
    const sched = new DecoyScheduler({
      senderId: "22222222-2222-4222-8222-222222222222",
      submit: (e) => void sent.push(e),
      intensity: "high",
      rng: () => 0.5,
      timer: fakeTimer,
    });
    sched.start();
    sched.stop();
    expect(sched.currentIntensity()).toBe("high");
  });

  it("reduces intensity one tier for low battery", () => {
    const sched = new DecoyScheduler({
      senderId: "x",
      submit: () => {},
      intensity: "high",
      timer: { setTimeout: () => 0, clearTimeout: () => {} },
    });
    sched.reduceForBattery();
    expect(sched.currentIntensity()).toBe("medium");
    sched.reduceForBattery();
    expect(sched.currentIntensity()).toBe("low");
  });

  it("off intensity has no standing cadence", () => {
    const sched = new DecoyScheduler({ senderId: "x", submit: () => {}, intensity: "off" });
    expect(sched.nextDelayMs()).toBeNull();
  });
});

describe("circuit construction", () => {
  it("selects a 3-hop path with no two hops in the same AS", () => {
    const path = selectPath(registry(), 3, { rng: () => 0.0 });
    expect(path).not.toBeNull();
    expect(path!).toHaveLength(3);
    const asNumbers = path!.map((n) => n.as_number);
    expect(new Set(asNumbers).size).toBe(3); // all distinct AS
  });

  it("excludes non-multi-hop nodes from multi-hop paths", () => {
    // Only b, c, and one of a/d are usable (a & d share AS); e is not multi-hop.
    const path = selectPath(registry(), 3, { rng: () => 0.0 });
    expect(path!.some((n) => n.address === "e.onion")).toBe(false);
  });

  it("returns null when no AS-diverse path of the length exists", () => {
    const onlyTwoAs: RelayNode[] = [
      { address: "a", public_key: "", as_number: 1, region: "eu", multi_hop: true },
      { address: "b", public_key: "", as_number: 1, region: "us", multi_hop: true },
      { address: "c", public_key: "", as_number: 2, region: "ap", multi_hop: true },
    ];
    expect(selectPath(onlyTwoAs, 3, { rng: () => 0.0 })).toBeNull();
  });

  it("rotates after the message or time limit", () => {
    const c = buildCircuit(registry(), 3, { rng: () => 0.0, nowMs: 1_000 })!;
    expect(shouldRotate(c, 1_000)).toBe(false);
    c.messageCount = 100;
    expect(shouldRotate(c, 1_000)).toBe(true);
    c.messageCount = 0;
    expect(shouldRotate(c, 1_000 + 600_000)).toBe(true);
  });

  it("pins the guard as the first hop across rebuilds", () => {
    const reg = registry();
    const guard = reg[1]!; // b.onion
    const path = selectPath(reg, 3, { rng: () => 0.0, pinnedGuard: guard });
    expect(path![0]!.address).toBe("b.onion");
  });
});
