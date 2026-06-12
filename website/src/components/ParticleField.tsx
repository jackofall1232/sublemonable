// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Subtle floating lemon-yellow particles — like citrus oils in light.
// Deterministic pseudo-random values so server and client render identically.

const PARTICLE_COUNT = 28;

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Particle {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

const PARTICLES: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  left: pseudoRandom(i + 1) * 100,
  top: 20 + pseudoRandom(i + 101) * 80,
  size: 1.5 + pseudoRandom(i + 201) * 2.5,
  duration: 9 + pseudoRandom(i + 301) * 14,
  delay: pseudoRandom(i + 401) * 12,
  opacity: 0.25 + pseudoRandom(i + 501) * 0.5,
}));

export function ParticleField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-lemon"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: 0,
            boxShadow: "0 0 6px rgba(245, 230, 66, 0.6)",
            animation: `float ${p.duration}s linear ${p.delay}s infinite`,
            ["--particle-opacity" as string]: p.opacity,
          }}
        />
      ))}
    </div>
  );
}
