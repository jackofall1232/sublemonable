// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Invisible watermarking for leak attribution: the recipient's ID and a
 * timestamp are steganographically embedded into message-background pixels via
 * least-significant-bit encoding. Invisible to the eye, survives lossless
 * screenshots — if a capture is shared, the watermark identifies the recipient.
 */

import { utf8Decode, utf8Encode } from "./encoding.js";

const MAGIC = 0x5b; // "[" — marks a Sublemonable watermark stream

/**
 * Embed payload bits into the LSB of the R/G/B channels of RGBA pixel data
 * (alpha untouched — compositing would destroy it). Pure function so it is
 * testable outside the DOM. Layout: magic(1) || length(2 BE) || payload.
 */
export function embedWatermarkBits(pixels: Uint8ClampedArray, payload: Uint8Array): void {
  const stream = new Uint8Array(3 + payload.length);
  stream[0] = MAGIC;
  stream[1] = (payload.length >> 8) & 0xff;
  stream[2] = payload.length & 0xff;
  stream.set(payload, 3);

  const bitsNeeded = stream.length * 8;
  const channelsAvailable = Math.floor(pixels.length / 4) * 3;
  if (bitsNeeded > channelsAvailable) throw new Error("payload too large for canvas");

  let bit = 0;
  for (let px = 0; bit < bitsNeeded; px += 4) {
    for (let c = 0; c < 3 && bit < bitsNeeded; c++, bit++) {
      const byte = stream[bit >> 3]!;
      const value = (byte >> (7 - (bit & 7))) & 1;
      pixels[px + c] = (pixels[px + c]! & 0xfe) | value;
    }
  }
}

/** Recover an embedded watermark payload, or null if none is present. */
export function extractWatermarkBits(pixels: Uint8ClampedArray): Uint8Array | null {
  const readBytes = (count: number, startBit: number): Uint8Array => {
    const out = new Uint8Array(count);
    for (let bit = 0; bit < count * 8; bit++) {
      const absolute = startBit + bit;
      const px = Math.floor(absolute / 3) * 4;
      const c = absolute % 3;
      const value = pixels[px + c]! & 1;
      out[bit >> 3] = (out[bit >> 3]! << 1) | value;
    }
    return out;
  };

  const header = readBytes(3, 0);
  if (header[0] !== MAGIC) return null;
  const length = (header[1]! << 8) | header[2]!;
  if (length === 0 || length * 8 > Math.floor(pixels.length / 4) * 3 - 24) return null;
  return readBytes(length, 24);
}

export interface WatermarkPayload {
  userId: string;
  messageId: string;
  timestamp: string;
}

export function decodeWatermarkPayload(bytes: Uint8Array): WatermarkPayload {
  return JSON.parse(utf8Decode(bytes)) as WatermarkPayload;
}

/**
 * Render a message-bubble background canvas carrying the invisible watermark.
 * Browser only (requires a DOM canvas).
 */
export function generateInvisibleWatermark(
  userId: string,
  messageId: string,
  width = 256,
  height = 64,
  backgroundColor = "#242100",
): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("generateInvisibleWatermark requires a DOM environment");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const payload: WatermarkPayload = {
    userId,
    messageId,
    timestamp: new Date().toISOString(),
  };
  embedWatermarkBits(imageData.data, utf8Encode(JSON.stringify(payload)));
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
