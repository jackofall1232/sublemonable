// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, type ReactNode } from "react";
import { BurnParticles } from "./BurnParticles.js";
import { BurnTimer } from "./BurnTimer.js";
import { color, motion, radius, typography } from "./tokens.js";

export interface MessageBubbleProps {
  children: ReactNode;
  direction: "sent" | "received";
  /** Marks a burn-on-read message (flame indicator on the bubble corner) */
  burnOnRead?: boolean;
  /** TTL countdown: renders a mini lemon-slice burn timer in the corner */
  ttlSeconds?: number;
  deliveredAt?: number;
  /** Set true to play the 600ms particle-dissolve destruction animation */
  burning?: boolean;
  /** Fired when the burn animation finishes — remove the message from state */
  onBurned?: () => void;
  /** Fired when a TTL timer reaches zero */
  onExpired?: () => void;
  timestamp?: string;
}

export function MessageBubble({
  children,
  direction,
  burnOnRead = false,
  ttlSeconds,
  deliveredAt,
  burning = false,
  onBurned,
  onExpired,
  timestamp,
}: MessageBubbleProps) {
  const [warningPulse, setWarningPulse] = useState(false);
  const sent = direction === "sent";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: sent ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        className="sub-message-content"
        onContextMenu={(e) => e.preventDefault()}
        onAnimationEnd={(e) => {
          if (e.animationName === "sub-burn-shrink") onBurned?.();
        }}
        style={{
          position: "relative",
          maxWidth: "72%",
          padding: "10px 14px",
          fontSize: "0.9375rem",
          fontFamily: typography.body.family,
          lineHeight: 1.45,
          background: sent ? color.semantic.backgroundMessageSent : color.semantic.backgroundMessageReceived,
          color: sent ? color.semantic.textOnLemon : color.semantic.textPrimary,
          border: sent ? "none" : `1px solid ${color.semantic.border}`,
          borderRadius: sent ? radius.bubbleSent : radius.bubbleReceived,
          transformOrigin: "center bottom",
          animation: burning
            ? `sub-burn-shrink ${motion.durationDramatic} ${motion.easingBurn} forwards`
            : warningPulse
              ? "sub-glow-pulse 1s ease-in-out infinite"
              : undefined,
        }}
      >
        {children}
        <BurnParticles active={burning} />

        {(burnOnRead || ttlSeconds || timestamp) && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
              fontSize: "0.6875rem",
              fontFamily: typography.mono.family,
              color: sent ? "rgba(13,12,0,0.55)" : color.semantic.textMuted,
            }}
          >
            {timestamp}
            {burnOnRead && <FlameIcon />}
            {ttlSeconds != null && deliveredAt != null && (
              <BurnTimer
                ttlSeconds={ttlSeconds}
                startedAt={deliveredAt}
                size={14}
                onExpired={() => {
                  setWarningPulse(false);
                  onExpired?.();
                }}
              />
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function FlameIcon() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" aria-label="Burns on read" role="img">
      <path
        d="M5.5 0C6.5 2.5 9.5 4 9.5 8a4 4 0 1 1-8 0C1.5 5.5 3 4.5 3.5 3c.8 1 1.2 1.8 1 3C6 5 5 2 5.5 0Z"
        fill={color.semantic.burnOrange}
      />
    </svg>
  );
}
