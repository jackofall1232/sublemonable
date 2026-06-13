// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Multi-hop relay wire types (v1.5). Onion-routed delivery through three relay
 * nodes; no single node knows both sender and recipient. The crypto for building
 * and peeling onions lives in @sublemonable/crypto; this module describes the
 * registry entries and the forward-packet shape.
 */

/** A relay node as advertised in the registry. */
export interface RelayNode {
  /** Stable relay identifier / address (e.g. an .onion host). */
  address: string;
  /** Base64 Curve25519 public key used to seal this node's onion layer. */
  public_key: string;
  /** Autonomous System number — used for path diversity (no two hops share one). */
  as_number: number;
  /** Coarse geographic region, used to prefer geographically diverse paths. */
  region: string;
  /** True if the node speaks the v1.5 onion-forwarding protocol. */
  multi_hop: boolean;
}

/**
 * POST /relay/forward — an onion packet handed to a relay. The relay peels one
 * layer with its private key, learning only the next hop, and forwards the
 * inner packet. The previous-hop address is never logged and is zeroed from
 * memory after forwarding.
 */
export interface RelayForwardRequest {
  /** Base64 onion packet sealed for THIS relay's public key. */
  packet: string;
}

/** A circuit is rotated after whichever of these limits is hit first. */
export const CIRCUIT_ROTATION_MESSAGES = 100;
export const CIRCUIT_ROTATION_SECONDS = 600;

/** Guard (first) hops rotate far less often to resist path-discovery attacks. */
export const GUARD_ROTATION_DAYS = 7;

/** A relay node's onion-decrypt circuit lifetime, in seconds. */
export const CIRCUIT_TTL_SECONDS = 300;
