// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Decoy (cover) traffic. A background generator emits fake encrypted envelopes
 * at Poisson-distributed intervals so that a network observer cannot tell when a
 * real message is sent — active and idle look identical.
 *
 * A decoy envelope MUST be byte-for-byte indistinguishable from a real one: same
 * 256-byte padded block size, same wire shape, same submission path. The only
 * difference is the recipient — a randomly generated UUID that resolves to
 * nowhere, so the relay holds it briefly and the TTL purges it, undelivered.
 */

import { aeadEncrypt, pad, randomBytes, toBase64 } from "@sublemonable/crypto";
import {
  PROTOCOL_VERSION,
  type CoverTrafficIntensity,
  type MessageEnvelope,
  DECOY_CADENCE_SECONDS,
} from "@sublemonable/protocol";
import { cadenceMeanSeconds, poissonIntervalMs, type UniformRng } from "./poisson.js";

/** Random UUID v4. Decoys are addressed to addresses that resolve to nowhere. */
function randomUuid(): string {
  return crypto.randomUUID();
}

/**
 * Build a single decoy envelope, byte-for-byte indistinguishable from a real one.
 *
 * A real ciphertext is the Double Ratchet blob `ratchet_pub(32) || nonce(12) ||
 * AEAD(plaintext)`, where the plaintext is padded to a 256-byte block. We
 * reproduce that exact shape: a random 32-byte "ratchet key", then an AEAD
 * encryption (under a throwaway random key) of a 256-byte-padded random body.
 * AEAD output is indistinguishable from random, so the result matches a genuine
 * single-block message in both structure and length (316 bytes). The recipient
 * is a random UUID that resolves nowhere; the relay holds it until the TTL purges
 * it, undelivered.
 */
export async function makeDecoyEnvelope(senderId: string): Promise<MessageEnvelope> {
  const ratchetKey = await randomBytes(32);
  const throwawayKey = await randomBytes(32);
  const body = await randomBytes(16 + Math.floor(Math.random() * 64));
  const box = await aeadEncrypt(throwawayKey, await pad(body)); // nonce(12)+ct+tag(16)
  const blob = new Uint8Array(ratchetKey.length + box.length);
  blob.set(ratchetKey, 0);
  blob.set(box, ratchetKey.length);
  return {
    id: randomUuid(),
    sender_id: senderId,
    recipient_id: randomUuid(), // resolves to nowhere — never delivered
    ciphertext: await toBase64(blob),
    ephemeral_key: null,
    prekey_id: null,
    message_number: 0,
    previous_chain_length: 0,
    timestamp: new Date().toISOString(),
    ttl_seconds: null,
    burn_on_read: false,
    media_type: "text",
    version: PROTOCOL_VERSION,
  };
}

/** Minimal timer surface so the scheduler can be driven by fake timers in tests. */
export interface Timer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimer: Timer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface DecoySchedulerOptions {
  senderId: string;
  /** Called to actually submit a decoy envelope over the same path as real ones. */
  submit: (envelope: MessageEnvelope) => void | Promise<void>;
  intensity: CoverTrafficIntensity;
  rng?: UniformRng;
  timer?: Timer;
}

/**
 * Drives continuous cover traffic. While running it schedules the next decoy at
 * a Poisson-sampled delay, submits it, and repeats. "off" and "low" have no
 * standing cadence (low is driven per real message by the caller, not here).
 *
 * On low battery the caller can downgrade intensity; the scheduler also exposes
 * `reduceForBattery()` to drop to the next lower tier.
 */
export class DecoyScheduler {
  private readonly senderId: string;
  private readonly submit: (envelope: MessageEnvelope) => void | Promise<void>;
  private readonly rng: UniformRng;
  private readonly timer: Timer;
  private intensity: CoverTrafficIntensity;
  private handle: unknown = null;
  private running = false;

  constructor(opts: DecoySchedulerOptions) {
    this.senderId = opts.senderId;
    this.submit = opts.submit;
    this.intensity = opts.intensity;
    this.rng = opts.rng ?? Math.random;
    this.timer = opts.timer ?? realTimer;
  }

  /** Start emitting cover traffic if the current intensity has a standing cadence. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.timer.clearTimeout(this.handle);
      this.handle = null;
    }
  }

  setIntensity(intensity: CoverTrafficIntensity): void {
    this.intensity = intensity;
    if (this.running) {
      this.stop();
      this.running = true;
      this.scheduleNext();
    }
  }

  /** Drop one intensity tier — used by the battery monitor on low power. */
  reduceForBattery(): void {
    const order: CoverTrafficIntensity[] = ["off", "low", "medium", "high"];
    const i = order.indexOf(this.intensity);
    if (i > 0) this.setIntensity(order[i - 1]!);
  }

  currentIntensity(): CoverTrafficIntensity {
    return this.intensity;
  }

  /** Milliseconds until the next decoy under the current intensity, or null if
   *  this intensity has no standing cadence. */
  nextDelayMs(): number | null {
    const range = DECOY_CADENCE_SECONDS[this.intensity];
    if (!range) return null;
    return poissonIntervalMs(cadenceMeanSeconds(range), this.rng);
  }

  private scheduleNext(): void {
    const delay = this.nextDelayMs();
    if (delay === null) {
      this.running = false;
      return;
    }
    this.handle = this.timer.setTimeout(() => {
      if (!this.running) return;
      void this.emitOnce();
      this.scheduleNext();
    }, delay);
  }

  // Build and submit one decoy. Errors are contained: cover traffic is
  // best-effort, and a failed submission must never surface as an unhandled
  // rejection or crash the scheduler — drop it and let the next tick continue.
  private async emitOnce(): Promise<void> {
    try {
      await this.submit(await makeDecoyEnvelope(this.senderId));
    } catch {
      /* swallow — cover traffic is best-effort by design */
    }
  }
}
