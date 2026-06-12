// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Config } from "tailwindcss";

// All values sourced from sublemonable-MASTER.json -> design_system.tokens
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lemon: {
          DEFAULT: "#F5E642",
          bright: "#FFE500",
          deep: "#D4C200",
          pale: "#FFFDE0",
          zest: "#E8B800",
        },
        rind: {
          DEFAULT: "#2A2500",
          soft: "#3D3800",
        },
        pulp: "#FFF8C0",
        offwhite: "#FAFAF2",
        bg: {
          primary: "#0D0C00",
          secondary: "#1A1800",
          elevated: "#242100",
        },
        ink: {
          primary: "#FAFAF2",
          secondary: "#A8A070",
          muted: "#5A5630",
          onlemon: "#0D0C00",
        },
        line: {
          DEFAULT: "#2E2B00",
          active: "#F5E642",
        },
        burn: {
          red: "#FF4444",
          orange: "#FF8C00",
        },
        verified: "#4ADE80",
      },
      fontFamily: {
        display: ["Clash Display", "var(--font-inter)", "Space Grotesk", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "Fira Code", "monospace"],
      },
      fontSize: {
        hero: ["5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },
      letterSpacing: {
        display: "-0.03em",
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "18px",
        xl: "24px",
        pill: "9999px",
        "bubble-sent": "18px 18px 4px 18px",
        "bubble-received": "18px 18px 18px 4px",
      },
      boxShadow: {
        "lemon-sm": "0 0 12px rgba(245, 230, 66, 0.3)",
        "lemon-md": "0 0 32px rgba(245, 230, 66, 0.2)",
        "lemon-lg": "0 0 80px rgba(245, 230, 66, 0.15)",
        card: "0 4px 24px rgba(0,0,0,0.4)",
        burn: "0 0 20px rgba(255, 68, 68, 0.4)",
      },
      backgroundImage: {
        "gradient-hero": "linear-gradient(135deg, #0D0C00 0%, #1A1800 50%, #2A2500 100%)",
        "gradient-lemon-glow":
          "radial-gradient(ellipse at center, rgba(245,230,66,0.15) 0%, transparent 70%)",
        "gradient-burn": "linear-gradient(90deg, #FF4444 0%, #FF8C00 50%, #F5E642 100%)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "400ms",
        dramatic: "600ms",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.16, 1, 0.3, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        burn: "cubic-bezier(0.4, 0, 1, 1)",
      },
      keyframes: {
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        float: {
          "0%": { transform: "translateY(0) translateX(0)", opacity: "0" },
          "10%": { opacity: "var(--particle-opacity, 0.6)" },
          "90%": { opacity: "var(--particle-opacity, 0.6)" },
          "100%": { transform: "translateY(-120px) translateX(16px)", opacity: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "scan-line": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(120px)" },
        },
        "rise-fade": {
          "0%": { transform: "translateY(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-48px) scale(0.4)", opacity: "0" },
        },
      },
      animation: {
        "spin-slow": "spin-slow 90s linear infinite",
        "glow-pulse": "glow-pulse 6s ease-in-out infinite",
        "scan-line": "scan-line 3s cubic-bezier(0.16, 1, 0.3, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
