// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { LemonSlice } from "./LemonSlice.js";
import { color, typography } from "./tokens.js";

export interface CaptureWarningOverlayProps {
  visible: boolean;
  message?: string;
}

/**
 * Full-container overlay shown while the message list is blurred (window lost
 * focus / capture suspected). The layout stays visible underneath; content
 * does not.
 */
export function CaptureWarningOverlay({
  visible,
  message = "Messages hidden while the window is unfocused",
}: CaptureWarningOverlayProps) {
  if (!visible) return null;
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        zIndex: 50,
        background: "rgba(13, 12, 0, 0.55)",
        pointerEvents: "none",
      }}
    >
      <LemonSlice variant="security_indicator" segments={8} size={48} label="Protected" />
      <span
        style={{
          color: color.semantic.textPrimary,
          fontFamily: typography.body.family,
          fontSize: "0.875rem",
          background: color.semantic.backgroundElevated,
          border: `1px solid ${color.semantic.border}`,
          borderRadius: 12,
          padding: "8px 16px",
        }}
      >
        {message}
      </span>
    </div>
  );
}
