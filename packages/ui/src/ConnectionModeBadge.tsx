// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Connection-mode badge (v1.5). Shows the active network mode in the chat header
 * as lemon-slice segments — one for Standard, three for Stealth, all eight slowly
 * pulsing for Ghost. A clearnet-fallback warning dot appears when Tor is
 * unavailable. The lemon slice is the heartbeat motif; here it shows how many
 * layers of the onion are active.
 */

import { LemonSlice } from "./LemonSlice.js";
import { color } from "./tokens.js";

export type ConnectionMode = "standard" | "stealth" | "ghost";
export type TransportState = "tor" | "i2p" | "clearnet_fallback" | "offline";

export interface ConnectionModeBadgeProps {
  mode: ConnectionMode;
  transport: TransportState;
  size?: number;
}

const MODE_SEGMENTS: Record<ConnectionMode, number> = { standard: 1, stealth: 3, ghost: 8 };
const MODE_LABEL: Record<ConnectionMode, string> = {
  standard: "Standard",
  stealth: "Stealth",
  ghost: "Ghost",
};

// Per-mode glow color: Standard green, Stealth amber, Ghost a pale white pulse.
const MODE_GLOW: Record<ConnectionMode, string> = {
  standard: color.semantic.verifiedGreen,
  stealth: color.semantic.burnOrange,
  ghost: color.core.lemonPale,
};

export function ConnectionModeBadge({ mode, transport, size = 18 }: ConnectionModeBadgeProps) {
  const segments = MODE_SEGMENTS[mode];
  const fallback = transport === "clearnet_fallback";
  const offline = transport === "offline";

  // I2P is treated like Tor for badge purposes: an anonymous transport is
  // active, so no warning dot. (I2P is never emitted in v1.5; the branch is here
  // so the badge is correct once I2P goes live.)
  const title = offline
    ? "No connection"
    : fallback
      ? "Tor unavailable — using direct connection"
      : transport === "i2p"
        ? `${MODE_LABEL[mode]} · I2P active`
        : `${MODE_LABEL[mode]} · Tor active`;

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      <LemonSlice
        variant="security_indicator"
        segments={offline ? 0 : segments}
        pulse={mode === "ghost" && !offline}
        size={size}
        fillColor={offline ? color.semantic.textMuted : MODE_GLOW[mode]}
        label={title}
      />
      {fallback && (
        // A yellow warning dot — not red, not alarming. Tor is the default; this
        // honestly flags the clearnet fallback.
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color.core.lemonBright,
            border: `1px solid ${color.semantic.backgroundPrimary}`,
          }}
        />
      )}
    </span>
  );
}
