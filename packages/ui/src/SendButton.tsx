// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The squeeze send button. Reconciled from the lemon-ui.jsx brainstorm into the
 * dark design system: a lemon-yellow circle (the primary action color) that
 * squeezes inward on press — like squeezing a lemon — and springs back. While
 * sending it shows the lemon-slice spinner rather than an arbitrary loader.
 *
 * The send button is ALWAYS lemon yellow with a dark glyph — never inverted.
 */

import { useState } from "react";
import { LemonSlice } from "./LemonSlice.js";
import { color, motion } from "./tokens.js";

export interface SendButtonProps {
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  size?: number;
  label?: string;
  /** Long-press handler — used to surface the "Send as dead drop" option. */
  onLongPress?: () => void;
}

const LONG_PRESS_MS = 500;

export function SendButton({
  onSend,
  disabled = false,
  sending = false,
  size = 40,
  label = "Send",
  onLongPress,
}: SendButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const beginPress = () => {
    setPressed(true);
    if (onLongPress) {
      setLongPressTimer(setTimeout(() => onLongPress(), LONG_PRESS_MS));
    }
  };
  const endPress = (fire: boolean) => {
    setPressed(false);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
      if (fire && !disabled && !sending) onSend();
    } else if (fire && !disabled && !sending) {
      onSend();
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={sending}
      disabled={disabled}
      onMouseDown={beginPress}
      onMouseUp={() => endPress(true)}
      onMouseLeave={() => endPress(false)}
      onTouchStart={beginPress}
      onTouchEnd={(e) => {
        e.preventDefault();
        endPress(true);
      }}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: sending ? color.core.lemonDeep : color.core.lemon,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // The squeeze: a firmer inward press than a generic tap, springing back.
        transform: pressed ? "scale(0.86)" : "scale(1)",
        transition: `transform ${motion.durationBase} ${motion.easingBounce}, background ${motion.durationBase}, box-shadow ${motion.durationBase}`,
      }}
      onMouseEnter={(e) => {
        if (disabled || sending) return;
        e.currentTarget.style.background = color.core.lemonBright;
        e.currentTarget.style.boxShadow = "0 0 16px rgba(245,230,66,0.4)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = sending ? color.core.lemonDeep : color.core.lemon;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {sending ? (
        <LemonSlice variant="loading_spinner" size={Math.round(size * 0.6)} label="Sending" />
      ) : (
        <svg
          width={Math.round(size * 0.45)}
          height={Math.round(size * 0.45)}
          viewBox="0 0 24 24"
          aria-hidden
        >
          {/* Send glyph in the dark on-lemon color. */}
          <path
            d="M5 12L19 5L14 12L19 19L5 12Z"
            fill={color.semantic.textOnLemon}
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
