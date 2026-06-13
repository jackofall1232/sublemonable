// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { LemonSlice } from "./LemonSlice.js";
import { color, typography } from "./tokens.js";

export type SecurityState = "verified" | "unverified" | "warning";

export interface SecurityBadgeProps {
  state: SecurityState;
  onClick?: () => void;
  size?: number;
}

const CONFIG: Record<SecurityState, { fill: string; segments: number; label: string }> = {
  verified: { fill: color.semantic.verifiedGreen, segments: 8, label: "Keys verified" },
  unverified: { fill: color.semantic.textSecondary, segments: 0, label: "Tap to verify" },
  warning: { fill: color.semantic.burnOrange, segments: 4, label: "Key changed — verify identity" },
};

/** Encryption status indicator built on the lemon slice (segments = verification level). */
export function SecurityBadge({ state, onClick, size = 18 }: SecurityBadgeProps) {
  const { fill, segments, label } = CONFIG[state];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        cursor: onClick ? "pointer" : "default",
        padding: 4,
        animation: state === "verified" ? "sub-ring-pulse 600ms ease-out 1" : undefined,
        borderRadius: 9999,
      }}
    >
      <LemonSlice
        variant="security_indicator"
        segments={segments}
        size={size}
        fillColor={fill}
        label={label}
      />
      <span style={{ color: fill, fontFamily: typography.body.family, fontSize: "0.75rem" }}>
        {label}
      </span>
    </button>
  );
}
