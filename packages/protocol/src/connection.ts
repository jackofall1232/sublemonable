// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { DEFAULT_PREFERRED_TRANSPORT, type PreferredTransport } from "./transport.js";

/**
 * Connection modes (v1.5). Three user-selectable profiles that compose the
 * network-layer features of the security onion. Each mode is a fixed bundle of
 * settings; selecting one in Settings → Network sets them all at once.
 *
 * Tor is the default transport in every mode — clearnet is only ever a fallback,
 * never a primary choice.
 */

export type ConnectionMode = "standard" | "stealth" | "ghost";

/** Cover-traffic intensity. Maps to a decoy-envelope cadence. */
export type CoverTrafficIntensity = "off" | "low" | "medium" | "high";

/** The platforms a client may run on. Tracked as session metadata only. */
export type Platform = "ios" | "android" | "browser";

/**
 * Live transport state shown by the connection-mode badge.
 *
 * "tor"               = connected via Tor hidden service (relay onion)
 * "i2p"               = connected via I2P (skeleton — never emitted in v1.5)
 * "clearnet_fallback" = connected via HTTPS/WSS clearnet; Tor and I2P unavailable
 * "offline"           = no connection
 */
export type TransportState = "tor" | "i2p" | "clearnet_fallback" | "offline";

export interface ConnectionModeConfig {
  mode: ConnectionMode;
  label: string;
  description: string;
  /** Tor is always true in v1.5 — clearnet is fallback, not a mode. */
  tor: true;
  /** Number of relay hops in the onion circuit. */
  relayHops: 1 | 3;
  /** Whether continuous cover traffic runs in this mode. */
  decoyTraffic: boolean;
  decoyIntensity: CoverTrafficIntensity;
  /** Ghost mode: every message is a dead drop; no direct channel exists. */
  deadDrop: boolean;
  /** Number of lemon-slice segments lit for this mode's badge (of 8). */
  litSegments: number;
}

export const CONNECTION_MODES: Record<ConnectionMode, ConnectionModeConfig> = {
  standard: {
    mode: "standard",
    label: "Standard",
    description: "Tor routing + single relay hop + Sealed Sender. Suitable for everyday use.",
    tor: true,
    relayHops: 1,
    decoyTraffic: false,
    decoyIntensity: "off",
    deadDrop: false,
    litSegments: 1,
  },
  stealth: {
    mode: "stealth",
    label: "Stealth",
    description: "Tor routing + 3-hop onion relay + decoy traffic. For sensitive communications.",
    tor: true,
    relayHops: 3,
    decoyTraffic: true,
    decoyIntensity: "medium",
    deadDrop: false,
    litSegments: 3,
  },
  ghost: {
    mode: "ghost",
    label: "Ghost",
    description:
      "Tor + 3-hop relay + continuous decoy traffic + dead drop only. No persistent identity visible on the network.",
    tor: true,
    relayHops: 3,
    decoyTraffic: true,
    decoyIntensity: "high",
    deadDrop: true,
    litSegments: 8,
  },
};

export const DEFAULT_CONNECTION_MODE: ConnectionMode = "standard";

/** Decoy cadence per intensity, as a [minSeconds, maxSeconds] range for the
 *  Poisson-distributed interval. "off" produces no traffic; "low" is event-driven
 *  (one decoy per real message) and has no standing cadence. */
export const DECOY_CADENCE_SECONDS: Record<CoverTrafficIntensity, [number, number] | null> = {
  off: null,
  low: null, // one decoy per real message — driven by sends, not a timer
  medium: [30, 120],
  high: [5, 30],
};

export function connectionModeConfig(mode: ConnectionMode): ConnectionModeConfig {
  return CONNECTION_MODES[mode];
}

/**
 * Persisted network settings shared across platforms (v1.5). The canonical shape
 * each client mirrors into its own storage. Carries no key material and nothing
 * that reveals vault count or existence.
 */
export interface PersistedNetworkSettings {
  connectionMode: ConnectionMode;
  coverTraffic: CoverTrafficIntensity;
  /** Preferred anonymous transport — see ./transport.ts. */
  preferredTransport: PreferredTransport;
  /**
   * When false, the transport resolver refuses to connect (returns "offline")
   * rather than falling back to warned clearnet. Default true.
   */
  allowClearnetFallback: boolean;
}

export const DEFAULT_NETWORK_SETTINGS: PersistedNetworkSettings = {
  connectionMode: DEFAULT_CONNECTION_MODE,
  coverTraffic: CONNECTION_MODES[DEFAULT_CONNECTION_MODE].decoyIntensity,
  preferredTransport: DEFAULT_PREFERRED_TRANSPORT,
  allowClearnetFallback: true,
};
