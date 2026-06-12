// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { SVGProps } from "react";

const SEGMENT_COUNT = 8;
const INNER_RADIUS = 11;
const OUTER_RADIUS = 38;
const GAP_DEGREES = 4.5;

function polar(radius: number, degrees: number): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

function segmentPath(index: number): string {
  const start = index * 45 + GAP_DEGREES;
  const end = (index + 1) * 45 - GAP_DEGREES;
  const [x1, y1] = polar(INNER_RADIUS, start);
  const [x2, y2] = polar(OUTER_RADIUS, start);
  const [x3, y3] = polar(OUTER_RADIUS, end);
  const [x4, y4] = polar(INNER_RADIUS, end);
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(x1)} ${f(y1)}`,
    `L ${f(x2)} ${f(y2)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${f(x3)} ${f(y3)}`,
    `L ${f(x4)} ${f(y4)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${f(x1)} ${f(y1)}`,
    "Z",
  ].join(" ");
}

const SEGMENT_PATHS = Array.from({ length: SEGMENT_COUNT }, (_, i) => segmentPath(i));

export interface LemonSliceProps extends Omit<SVGProps<SVGSVGElement>, "viewBox"> {
  /** Pixel size of the rendered slice (width and height). */
  size?: number;
  /** Number of illuminated segments, 0–8. Defaults to all 8. */
  segments?: number;
  /** Fill color of illuminated segments. */
  segmentColor?: string;
  /** Fill color of unlit segments. */
  emptyColor?: string;
  /** Color of the outer rind ring. */
  rindColor?: string;
  /** Color of the center pip. */
  pipColor?: string;
  /** Accessible label. Pass an empty string to mark the slice decorative. */
  label?: string;
}

/**
 * The signature Sublemonable mark: an 8-segment lemon slice.
 * Used as logo, hero visual, loader, and section accent across the site.
 */
export function LemonSlice({
  size = 48,
  segments = SEGMENT_COUNT,
  segmentColor = "#F5E642",
  emptyColor = "#2E2B00",
  rindColor = "#D4C200",
  pipColor = "#E8B800",
  label = "Sublemonable lemon slice mark",
  ...rest
}: LemonSliceProps) {
  const lit = Math.max(0, Math.min(SEGMENT_COUNT, Math.round(segments)));
  const decorative = label === "";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      {...rest}
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke={rindColor} strokeWidth="5" />
      {SEGMENT_PATHS.map((d, i) => (
        <path key={i} d={d} fill={i < lit ? segmentColor : emptyColor} />
      ))}
      <circle cx="50" cy="50" r="5.5" fill={pipColor} />
    </svg>
  );
}

export default LemonSlice;
