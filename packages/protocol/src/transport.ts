// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Multi-transport types (v1.5). The user picks a preferred anonymous transport
// (Tor or I2P); the client resolves an active transport along an explicit
// fallback chain that ends, as a last resort, at warned clearnet. I2P is a
// skeleton in v1.5 — the types and chain are in place so a future release can
// enable it without structural change. See docs/TOR_ARCHITECTURE.md.

import type { TransportState } from "./connection.js";

/**
 * User-selectable preferred anonymous transport.
 * "tor_first" = try Tor first, fall back to I2P, then clearnet.
 * "i2p_first" = try I2P first, fall back to Tor, then clearnet.
 *
 * In v1.5, I2P is a skeleton — selecting i2p_first logs intent but falls
 * through to Tor immediately. The option is present so settings persist
 * correctly when I2P is enabled in a future release.
 */
export type PreferredTransport = "tor_first" | "i2p_first";

export const DEFAULT_PREFERRED_TRANSPORT: PreferredTransport = "tor_first";

/**
 * Fallback chain resolution result.
 * Records which transport is active and whether a warning must be shown.
 */
export interface TransportResolution {
  transport: TransportState;
  /** True when clearnet is active — always show the security warning banner. */
  showClearnetWarning: boolean;
  /** Human-readable reason for the fallback, shown in the warning. */
  fallbackReason?: string;
}

/**
 * Warning copy shown when the app falls back to clearnet.
 * Honest, not alarmist — the user chose to allow fallback implicitly by
 * not disabling it.
 */
export const CLEARNET_WARNING = {
  title: "Tor unavailable — using clearnet",
  body: "Your connection is not routed through Tor. Your IP address may be visible to the relay. Toggling off Tor removes a layer of anonymity protection.",
  settingsLink: "Network settings",
} as const;

export const I2P_UNAVAILABLE_WARNING = {
  title: "I2P unavailable",
  body: "I2P could not be reached. Falling back to Tor.",
} as const;
