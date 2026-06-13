// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Circuit construction and path selection for the multi-hop relay. A circuit is
 * an ordered list of relay nodes. Path selection enforces the diversity rules
 * that make onion routing meaningful, and rotation keeps any single path from
 * being usable long enough to deanonymize.
 *
 * Rules:
 *  - No two hops may share an Autonomous System. Two hops in the same AS could be
 *    correlated by a single network operator, defeating the purpose.
 *  - Geographic diversity is preferred when AS diversity leaves a choice.
 *  - Only multi-hop-capable nodes are eligible for multi-hop paths.
 *  - The first hop (guard) rotates far less often than the rest, to resist
 *    path-discovery attacks.
 */

import {
  CIRCUIT_ROTATION_MESSAGES,
  CIRCUIT_ROTATION_SECONDS,
  type RelayNode,
} from "@sublemonable/protocol";

export interface Circuit {
  hops: RelayNode[];
  createdAtMs: number;
  /** Messages sent over this circuit so far. */
  messageCount: number;
}

/** Injectable RNG for deterministic tests. Returns a float in [0, 1). */
export type UniformRng = () => number;

function shuffle<T>(items: readonly T[], rng: UniformRng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Select a path of `hops` relays with no two hops in the same AS, preferring
 * geographic diversity. A `pinnedGuard` (the long-lived first hop) is placed
 * first when provided and compatible. Returns null if no diverse path of the
 * requested length exists.
 */
export function selectPath(
  registry: readonly RelayNode[],
  hops: number,
  opts: { rng?: UniformRng; pinnedGuard?: RelayNode } = {},
): RelayNode[] | null {
  const rng = opts.rng ?? Math.random;
  const eligible = hops > 1 ? registry.filter((n) => n.multi_hop) : registry.slice();

  const path: RelayNode[] = [];
  const usedAs = new Set<number>();
  const usedRegions = new Set<string>();

  if (opts.pinnedGuard && eligible.some((n) => n.address === opts.pinnedGuard!.address)) {
    path.push(opts.pinnedGuard);
    usedAs.add(opts.pinnedGuard.as_number);
    usedRegions.add(opts.pinnedGuard.region);
  }

  const pool = shuffle(
    eligible.filter((n) => !path.some((p) => p.address === n.address)),
    rng,
  );

  // Greedy pass preferring a fresh region; AS uniqueness is a hard constraint.
  for (const preferNewRegion of [true, false]) {
    for (const node of pool) {
      if (path.length >= hops) break;
      if (path.some((p) => p.address === node.address)) continue;
      if (usedAs.has(node.as_number)) continue;
      if (preferNewRegion && usedRegions.has(node.region)) continue;
      path.push(node);
      usedAs.add(node.as_number);
      usedRegions.add(node.region);
    }
    if (path.length >= hops) break;
  }

  return path.length === hops ? path : null;
}

/** Construct a fresh circuit, or null if no diverse path is available. */
export function buildCircuit(
  registry: readonly RelayNode[],
  hops: number,
  opts: { rng?: UniformRng; pinnedGuard?: RelayNode; nowMs?: number } = {},
): Circuit | null {
  const path = selectPath(registry, hops, opts);
  if (!path) return null;
  return { hops: path, createdAtMs: opts.nowMs ?? Date.now(), messageCount: 0 };
}

/**
 * Whether a circuit is due for rotation: it has carried 100 messages, or it is
 * 10 minutes old, whichever comes first.
 */
export function shouldRotate(circuit: Circuit, nowMs: number = Date.now()): boolean {
  if (circuit.messageCount >= CIRCUIT_ROTATION_MESSAGES) return true;
  return nowMs - circuit.createdAtMs >= CIRCUIT_ROTATION_SECONDS * 1000;
}

/** The guard (first) hop of a circuit, pinned across rotations until it expires. */
export function guardOf(circuit: Circuit): RelayNode | null {
  return circuit.hops[0] ?? null;
}
