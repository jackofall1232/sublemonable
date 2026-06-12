// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { color, typography } from "./tokens.js";

export interface KeyFingerprintDisplayProps {
  /** Safety Number string — groups of 4 hex chars separated by spaces */
  fingerprint: string;
  /** Highlighted groups (e.g. while the peer reads theirs aloud) */
  highlightGroups?: number[];
  label?: string;
}

/** Key fingerprints always render in JetBrains Mono. */
export function KeyFingerprintDisplay({
  fingerprint,
  highlightGroups = [],
  label = "Safety Number",
}: KeyFingerprintDisplayProps) {
  const groups = fingerprint.split(" ");
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <figcaption
        style={{
          color: color.semantic.textSecondary,
          fontFamily: typography.body.family,
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {label}
      </figcaption>
      <code
        style={{
          display: "inline-grid",
          gridTemplateColumns: "repeat(5, auto)",
          gap: "4px 12px",
          fontFamily: typography.mono.family,
          fontSize: "0.875rem",
          background: color.semantic.backgroundElevated,
          border: `1px solid ${color.semantic.border}`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        {groups.map((g, i) => (
          <span
            key={i}
            style={{ color: highlightGroups.includes(i) ? color.core.lemon : color.semantic.textSecondary }}
          >
            {g}
          </span>
        ))}
      </code>
    </figure>
  );
}
