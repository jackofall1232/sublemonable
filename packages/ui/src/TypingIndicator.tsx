// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Typing indicator — three lemon drops bouncing in sequence. Reconciled from the
 * lemon-ui.jsx brainstorm into the dark design system: lemon-yellow drops on a
 * received-message bubble background, never the brainstorm's white card.
 *
 * Requires the `sub-drop-bounce` keyframe from <SublemonableStyles />.
 */

import { color } from "./tokens.js";

export interface TypingIndicatorProps {
  /** Render inside a received-style bubble. Defaults to true. */
  bubble?: boolean;
  label?: string;
}

const DROP_COUNT = 3;

export function TypingIndicator({
  bubble = true,
  label = "Contact is typing",
}: TypingIndicatorProps) {
  const drops = (
    <div
      role="status"
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px" }}
    >
      {Array.from({ length: DROP_COUNT }, (_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: 8,
            height: 10,
            background: color.core.lemon,
            // A lemon-drop teardrop silhouette.
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            boxShadow: "0 0 4px rgba(245,230,66,0.4)",
            animation: `sub-drop-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  );

  if (!bubble) return drops;

  return (
    <div
      style={{
        display: "inline-flex",
        background: color.semantic.backgroundMessageReceived,
        border: `1px solid ${color.semantic.border}`,
        borderRadius: "18px 18px 18px 4px",
      }}
    >
      {drops}
    </div>
  );
}
