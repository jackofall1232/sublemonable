// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Poisson-process interval timing for decoy traffic. Real human messaging is
 * bursty, not periodic; sampling inter-arrival times from an exponential
 * distribution (the gaps in a Poisson process) makes cover traffic look like
 * organic activity rather than a metronome an observer could filter out.
 */

/** Injectable uniform RNG in [0, 1). Defaults to Math.random; tests pass a stub. */
export type UniformRng = () => number;

/**
 * Sample one inter-arrival gap (milliseconds) from an exponential distribution
 * with the given mean. Derived from the inverse-CDF: -mean * ln(1 - U).
 */
export function poissonIntervalMs(meanSeconds: number, rng: UniformRng = Math.random): number {
  if (meanSeconds <= 0) throw new Error("mean must be positive");
  // Clamp U away from 0 so ln() stays finite.
  const u = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, rng()));
  return -meanSeconds * 1000 * Math.log(1 - u);
}

/**
 * The mean inter-arrival used for a [min, max] cadence range. The midpoint gives
 * an expected rate inside the configured band while the exponential spread keeps
 * individual gaps unpredictable.
 */
export function cadenceMeanSeconds(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}
