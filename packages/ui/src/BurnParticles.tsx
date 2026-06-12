// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The burn animation: flame particles dissolve UPWARD over 600ms while the
 * bubble chars and shrinks. Deliberately not an opacity fade — destruction
 * should feel satisfying.
 */

import { useMemo } from "react";
import { color, motion } from "./tokens.js";

const PARTICLE_COUNT = 18;
const PARTICLE_COLORS = [color.semantic.burnRed, color.semantic.burnOrange, color.core.lemon];

export function BurnParticles({ active }: { active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        drift: ((i * 53) % 40) - 20,
        delay: (i * 31) % 240,
        size: 3 + ((i * 7) % 5),
        fill: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
      })),
    [],
  );

  if (!active) return null;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            bottom: "40%",
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.fill,
            ["--sub-drift" as string]: `${p.drift}px`,
            animation: `sub-burn-particle ${motion.durationDramatic} ${motion.easingBurn} ${p.delay}ms forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
