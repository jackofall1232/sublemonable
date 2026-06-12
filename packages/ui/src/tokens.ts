// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sublemonable Design System tokens, v1.0.0.
 * "Secure doesn't have to feel cold." Dark only — no light mode in v1.
 * Lemon yellow owns ALL interactivity; blue is never used for interactive
 * elements, and nothing renders on a background lighter than #1A1800.
 */

export const color = {
  core: {
    lemon: "#F5E642",
    lemonBright: "#FFE500",
    lemonDeep: "#D4C200",
    lemonPale: "#FFFDE0",
    lemonZest: "#E8B800",
    rind: "#2A2500",
    rindSoft: "#3D3800",
    pulp: "#FFF8C0",
    white: "#FFFFFF",
    offWhite: "#FAFAF2",
  },
  semantic: {
    backgroundPrimary: "#0D0C00",
    backgroundSecondary: "#1A1800",
    backgroundElevated: "#242100",
    backgroundMessageSent: "#F5E642",
    backgroundMessageReceived: "#242100",
    textPrimary: "#FAFAF2",
    textSecondary: "#A8A070",
    textOnLemon: "#0D0C00",
    textMuted: "#5A5630",
    border: "#2E2B00",
    borderActive: "#F5E642",
    burnRed: "#FF4444",
    burnOrange: "#FF8C00",
    verifiedGreen: "#4ADE80",
    error: "#FF4444",
    success: "#4ADE80",
  },
  gradients: {
    hero: "linear-gradient(135deg, #0D0C00 0%, #1A1800 50%, #2A2500 100%)",
    lemonGlow: "radial-gradient(ellipse at center, rgba(245,230,66,0.15) 0%, transparent 70%)",
    messageBurn: "linear-gradient(90deg, #FF4444 0%, #FF8C00 50%, #F5E642 100%)",
    lemonSlice: "conic-gradient(from 0deg, #F5E642 0%, #D4C200 30%, #F5E642 60%, #FFE500 100%)",
  },
} as const;

export const typography = {
  display: {
    family: "'Clash Display', 'Space Grotesk', sans-serif",
    weights: [500, 600, 700],
    letterSpacing: "-0.03em",
  },
  body: {
    family: "Inter, system-ui, sans-serif",
    weights: [400, 500],
  },
  mono: {
    family: "'JetBrains Mono', 'Fira Code', monospace",
    weights: [400],
  },
  scale: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    hero: "5rem",
  },
} as const;

/** 4px base unit. */
export const spacing = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128] as const;

export const radius = {
  sm: "6px",
  md: "12px",
  lg: "18px",
  xl: "24px",
  bubbleSent: "18px 18px 4px 18px",
  bubbleReceived: "18px 18px 18px 4px",
  pill: "9999px",
  circle: "50%",
} as const;

export const shadows = {
  lemonGlowSm: "0 0 12px rgba(245, 230, 66, 0.3)",
  lemonGlowMd: "0 0 32px rgba(245, 230, 66, 0.2)",
  lemonGlowLg: "0 0 80px rgba(245, 230, 66, 0.15)",
  card: "0 4px 24px rgba(0,0,0,0.4)",
  burn: "0 0 20px rgba(255, 68, 68, 0.4)",
} as const;

export const motion = {
  durationFast: "120ms",
  durationBase: "200ms",
  durationSlow: "400ms",
  durationDramatic: "600ms",
  easingDefault: "cubic-bezier(0.16, 1, 0.3, 1)",
  easingBounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easingBurn: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const tokens = { color, typography, spacing, radius, shadows, motion } as const;
