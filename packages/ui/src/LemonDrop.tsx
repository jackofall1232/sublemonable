// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The delivery drop — a small lemon-juice droplet that springs in to confirm a
 * message was sent. Reconciled from the lemon-ui.jsx brainstorm into the dark
 * design system (lemon-yellow droplet, lemon-deep stroke; no light card).
 */

import { color, motion } from "./tokens.js";

export interface LemonDropProps {
  visible: boolean;
  size?: number;
}

export function LemonDrop({ visible, size = 28 }: LemonDropProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
      }}
    >
      <svg
        width={size * 0.8}
        height={size}
        viewBox="0 0 22 28"
        aria-hidden
        style={{
          transform: visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.7)",
          opacity: visible ? 1 : 0,
          transition: `transform ${motion.durationSlow} ${motion.easingBounce}, opacity ${motion.durationSlow} ${motion.easingBounce}`,
        }}
      >
        <path
          d="M11 2 C11 2 2 12 2 18 C2 23.5 6 27 11 27 C16 27 20 23.5 20 18 C20 12 11 2 11 2Z"
          fill={color.core.lemon}
          stroke={color.core.lemonDeep}
          strokeWidth="1"
        />
        {/* Gloss highlight. */}
        <ellipse
          cx="8"
          cy="14"
          rx="2.5"
          ry="4"
          fill={color.core.lemonPale}
          opacity="0.7"
          transform="rotate(-15 8 14)"
        />
      </svg>
    </span>
  );
}
