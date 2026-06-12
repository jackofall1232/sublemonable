// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The Lemon Slice — Sublemonable's signature element. A segmented circle that
 * appears as the logo mark, loading spinner, burn timer, security indicator,
 * and send button. Every moment of waiting, protecting, or destroying is shown
 * through this one motif.
 */

import { useEffect, useState } from "react";
import { color } from "./tokens.js";

export type LemonSliceVariant =
  | "logo_mark"
  | "loading_spinner"
  | "burn_timer"
  | "security_indicator"
  | "send_button";

export interface LemonSliceProps {
  variant?: LemonSliceVariant;
  /** Number of illuminated segments, 0–8. Ignored by logo_mark and loading_spinner. */
  segments?: number;
  size?: number;
  /** Overrides the variant's default fill (e.g. green for a verified badge) */
  fillColor?: string;
  emptyColor?: string;
  /** Accessible label; defaults per variant */
  label?: string;
  className?: string;
}

export const SEGMENT_COUNT = 8;
const SPIN_INTERVAL_MS = 110;

/** SVG path for one wedge of the slice (pie segment with a small gap and center pip hole). */
function segmentPath(index: number, cx: number, cy: number, outerR: number, innerR: number): string {
  const step = (2 * Math.PI) / SEGMENT_COUNT;
  const gap = 0.1; // radians between wedges — reads as the lemon's pith
  const start = index * step - Math.PI / 2 + gap / 2;
  const end = (index + 1) * step - Math.PI / 2 - gap / 2;
  const x1 = cx + innerR * Math.cos(start);
  const y1 = cy + innerR * Math.sin(start);
  const x2 = cx + outerR * Math.cos(start);
  const y2 = cy + outerR * Math.sin(start);
  const x3 = cx + outerR * Math.cos(end);
  const y3 = cy + outerR * Math.sin(end);
  const x4 = cx + innerR * Math.cos(end);
  const y4 = cy + innerR * Math.sin(end);
  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 0 0 ${x1} ${y1} Z`;
}

const DEFAULT_LABELS: Record<LemonSliceVariant, string> = {
  logo_mark: "Sublemonable",
  loading_spinner: "Loading",
  burn_timer: "Time remaining",
  security_indicator: "Security level",
  send_button: "Send",
};

export function LemonSlice({
  variant = "logo_mark",
  segments = SEGMENT_COUNT,
  size = 48,
  fillColor,
  emptyColor = color.semantic.border,
  label,
  className,
}: LemonSliceProps) {
  const [spinIndex, setSpinIndex] = useState(0);
  const spinning = variant === "loading_spinner";

  useEffect(() => {
    if (!spinning) return;
    const id = setInterval(() => setSpinIndex((i) => (i + 1) % (SEGMENT_COUNT + 1)), SPIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [spinning]);

  const cx = size / 2;
  const cy = size / 2;
  const rindR = size * 0.47;
  const outerR = size * 0.38;
  const innerR = size * 0.08;

  const filled = Math.max(0, Math.min(SEGMENT_COUNT, spinning ? spinIndex : segments));

  // Burn timers shift from lemon → orange when low → red on the final segment
  const segmentFill = (isLit: boolean): string => {
    if (!isLit) return emptyColor;
    if (fillColor) return fillColor;
    if (variant === "burn_timer") {
      if (filled === 1) return color.semantic.burnRed;
      if (filled <= 2) return color.semantic.burnOrange;
    }
    return color.core.lemon;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? DEFAULT_LABELS[variant]}
      className={className}
      style={{ display: "block" }}
    >
      {/* Rind ring */}
      <circle
        cx={cx}
        cy={cy}
        r={rindR}
        fill="none"
        stroke={variant === "send_button" ? color.semantic.textOnLemon : color.core.lemonDeep}
        strokeWidth={Math.max(1, size * 0.035)}
        opacity={0.9}
      />
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <path
          key={i}
          d={segmentPath(i, cx, cy, outerR, innerR)}
          fill={segmentFill(i < filled)}
          style={{
            transition: spinning ? "fill 80ms linear" : "fill 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      ))}
      {/* Center pip */}
      <circle cx={cx} cy={cy} r={size * 0.045} fill={color.core.lemonZest} />
    </svg>
  );
}

/** Every loading state in the app uses this spinner — no other loaders. */
export function LemonSpinner({ size = 40, label = "Loading" }: { size?: number; label?: string }) {
  return <LemonSlice variant="loading_spinner" size={size} label={label} />;
}
