// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import { LemonSlice, SEGMENT_COUNT } from "./LemonSlice.js";

export interface BurnTimerProps {
  /** Total TTL in seconds */
  ttlSeconds: number;
  /** Epoch ms when the timer started (delivery time) */
  startedAt: number;
  size?: number;
  /** Fired once when the final segment extinguishes */
  onExpired?: () => void;
}

/**
 * Countdown ring around timed messages: lemon slice segments extinguish as the
 * TTL counts down; the final segment triggers the destruction animation.
 */
export function BurnTimer({ ttlSeconds, startedAt, size = 16, onExpired }: BurnTimerProps) {
  const [remaining, setRemaining] = useState(() => remainingSegments(ttlSeconds, startedAt));

  useEffect(() => {
    const id = setInterval(() => {
      const next = remainingSegments(ttlSeconds, startedAt);
      setRemaining((prev) => {
        if (prev > 0 && next === 0) onExpired?.();
        return next;
      });
    }, Math.max(250, (ttlSeconds * 1000) / SEGMENT_COUNT / 4));
    return () => clearInterval(id);
  }, [ttlSeconds, startedAt, onExpired]);

  return <LemonSlice variant="burn_timer" segments={remaining} size={size} label={`Burns in ${ttlSeconds}s`} />;
}

function remainingSegments(ttlSeconds: number, startedAt: number): number {
  const elapsed = (Date.now() - startedAt) / 1000;
  const fraction = Math.max(0, 1 - elapsed / ttlSeconds);
  return Math.ceil(fraction * SEGMENT_COUNT);
}
