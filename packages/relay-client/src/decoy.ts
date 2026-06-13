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

import { pad, randomBytes, toBase64 } from "@sublemonable/crypto";
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
 * Build a single decoy envelope. Its ciphertext is random bytes padded to the
 * same 256-byte block boundary a real message uses, so size analysis cannot
 * separate it from genuine traffic. `senderId` matches real envelopes so the
 * sender field is not itself a tell.
 */
export async function makeDecoyEnvelope(senderId: string): Promise<MessageEnvelope> {
  // A plausible short-message-sized random body, padded like the real thing.
  const body = await randomBytes(16 + Math.floor(Math.random() * 64));
  const ciphertext = await toBase64(await pad(body));
  return {
    id: randomUuid(),
    sender_id: senderId,
    recipient_id: randomUuid(), // resolves to nowhere — never delivered
    ciphertext,
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
      void this.submit(makeDecoyEnvelopeBound(this.senderId));
      this.scheduleNext();
    }, delay);
  }
}

// Synchronous binding helper kept separate so scheduleNext stays terse. Returns a
// promise the caller may ignore; submission errors are the caller's concern.
function makeDecoyEnvelopeBound(senderId: string): MessageEnvelope {
  // A lightweight synchronous decoy: random-ish ciphertext at a fixed 256-byte
  // block. (The async makeDecoyEnvelope is used where real entropy/padding from
  // libsodium is desired; the scheduler path stays synchronous for the timer.)
  const filler = base64Block();
  return {
    id: crypto.randomUUID(),
    sender_id: senderId,
    recipient_id: crypto.randomUUID(),
    ciphertext: filler,
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

// One 256-byte block of base64 random bytes via WebCrypto (available in browser,
// Node ≥ 20, and Workers — the environments the scheduler runs in).
function base64Block(): string {
  const bytes = new Uint8Array(256);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
