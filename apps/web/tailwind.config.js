// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.tsx"],
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
        rind: { DEFAULT: "#2A2500", soft: "#3D3800" },
        bg: {
          primary: "#0D0C00",
          secondary: "#1A1800",
          elevated: "#242100",
        },
        ink: {
          primary: "#FAFAF2",
          secondary: "#A8A070",
          muted: "#5A5630",
          "on-lemon": "#0D0C00",
        },
        line: { DEFAULT: "#2E2B00", active: "#F5E642" },
        burn: { red: "#FF4444", orange: "#FF8C00" },
        verified: "#4ADE80",
      },
      fontFamily: {
        display: ["'Clash Display'", "'Space Grotesk'", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      boxShadow: {
        "lemon-sm": "0 0 12px rgba(245, 230, 66, 0.3)",
        "lemon-md": "0 0 32px rgba(245, 230, 66, 0.2)",
        "lemon-lg": "0 0 80px rgba(245, 230, 66, 0.15)",
        card: "0 4px 24px rgba(0,0,0,0.4)",
        burn: "0 0 20px rgba(255, 68, 68, 0.4)",
      },
      borderRadius: {
        "bubble-sent": "18px 18px 4px 18px",
        "bubble-received": "18px 18px 18px 4px",
      },
    },
  },
  plugins: [],
};
