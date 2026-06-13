// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Platform-warning badge. Browser clients cannot block screenshots at the OS
 * level; contacts on native apps deserve to know, and browser users deserve an
 * honest, upfront note about their own limitation. Lemon-yellow informative tone
 * — never red, never a modal, always dismissible. It re-appears only if the
 * platform changes after dismissal.
 */

import { color, typography } from "./tokens.js";

export interface PlatformWarningBadgeProps {
  /** Copy to show. Empty/absent means render nothing. */
  copy: string;
  show: boolean;
  onDismiss?: () => void;
}

export function PlatformWarningBadge({ copy, show, onDismiss }: PlatformWarningBadgeProps) {
  if (!show || !copy) return null;
  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        // Informative lemon tint over the dark header — not alarming.
        background: "rgba(245, 230, 66, 0.10)",
        borderBottom: `1px solid ${color.semantic.border}`,
        color: color.semantic.textSecondary,
        fontFamily: typography.body.family,
        fontSize: typography.scale.xs,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: 1 }}>{copy}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: color.semantic.textMuted,
            fontSize: "1rem",
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
