// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Multi-transport types (v1.5). The relay transport hierarchy is FIXED, not
// user-selectable: I2P is the primary anonymous transport, Tor is the relay
// fallback when I2P is unavailable, and clearnet is the last resort (always
// warned). I2P is a skeleton in v1.5 — the chain is in place so a future
// release can enable live I2P traffic without structural change; until then,
// detectI2P() always returns false and the chain falls through to Tor. See
// docs/TOR_ARCHITECTURE.md.

import type { TransportState } from "./connection.js";

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
 * not disabling it. Transport anonymity and message confidentiality are
 * independent: clearnet fallback affects anonymity only, never encryption.
 */
export const CLEARNET_WARNING = {
  title: "Clearnet fallback active",
  body: "Your messages are still end-to-end encrypted and unreadable by the relay. However, your IP address may be visible. For full anonymity, ensure I2P or Tor is available on your device.",
  settingsLink: "Network settings",
} as const;

export const I2P_UNAVAILABLE_WARNING = {
  title: "I2P unavailable",
  body: "I2P could not be reached. Falling back to Tor.",
} as const;
