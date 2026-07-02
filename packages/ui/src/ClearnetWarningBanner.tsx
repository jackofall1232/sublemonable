// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Clearnet-fallback warning banner (v1.5). Shown whenever the live transport is
 * `clearnet_fallback` — I2P and Tor were both unavailable and the app connected
 * over plain HTTPS/WSS instead.
 *
 * Honest, not alarmist: the user implicitly allowed fallback by leaving it
 * enabled, so this is an amber informative banner (not a red modal). It is
 * dismissible for the session only — it re-appears on the next connection
 * attempt, because the security trade-off is still in effect.
 */

import { color, typography } from "./tokens.js";

export interface ClearnetWarningBannerProps {
  /** Human-readable reason for the fallback (from TransportResolution). */
  reason?: string;
  /** Opens Settings → Network. */
  onOpenSettings: () => void;
  /** Hides the banner for this session. Re-shown on the next reconnect. */
  onDismiss?: () => void;
}

export function ClearnetWarningBanner({
  reason,
  onOpenSettings,
  onDismiss,
}: ClearnetWarningBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        // Amber tint over the dark surface — flags the trade-off without panic.
        background: "rgba(255, 140, 0, 0.12)",
        borderBottom: `1px solid ${color.semantic.border}`,
        color: color.semantic.textPrimary,
        fontFamily: typography.body.family,
        fontSize: typography.scale.xs,
        lineHeight: 1.4,
      }}
    >
      {/* Shield-off mark: a lemon slice with a slash, drawn inline so the banner
          pulls in no external asset. */}
      <svg
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        style={{ flexShrink: 0 }}
        fill="none"
        stroke={color.semantic.burnOrange}
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        <path d="M8 1.5l5 2v4c0 3-2.2 4.8-5 6-2.8-1.2-5-3-5-6v-4l5-2z" />
        <line x1="2.5" y1="2" x2="13.5" y2="14" />
      </svg>
      <span style={{ flex: 1 }}>
        <strong style={{ color: color.semantic.textPrimary }}>Clearnet fallback active.</strong>{" "}
        {reason ?? "Your IP may be visible to the relay."}
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          whiteSpace: "nowrap",
          color: color.core.lemonBright,
          fontFamily: typography.body.family,
          fontSize: typography.scale.xs,
          padding: 2,
        }}
      >
        Network settings →
      </button>
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
