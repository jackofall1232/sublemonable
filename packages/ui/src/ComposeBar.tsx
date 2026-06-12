// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { LemonSlice } from "./LemonSlice.js";
import { color, motion, typography } from "./tokens.js";

export interface ComposeBarProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ComposeBar({ onSend, onAttach, disabled = false, placeholder = "Message" }: ComposeBarProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: 12,
        background: color.semantic.backgroundSecondary,
        borderTop: `1px solid ${color.semantic.border}`,
      }}
    >
      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          aria-label="Attach"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: color.semantic.textSecondary,
            padding: 8,
            fontSize: "1.25rem",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = color.core.lemon)}
          onMouseLeave={(e) => (e.currentTarget.style.color = color.semantic.textSecondary)}
        >
          +
        </button>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={1}
        style={{
          flex: 1,
          resize: "none",
          background: color.semantic.backgroundElevated,
          border: `1px solid ${focused ? color.semantic.borderActive : color.semantic.border}`,
          borderRadius: 24,
          padding: "10px 16px",
          color: color.semantic.textPrimary,
          fontFamily: typography.body.family,
          fontSize: "0.9375rem",
          outline: "none",
          transition: `border-color ${motion.durationBase} ${motion.easingDefault}`,
        }}
      />
      {/* The send button is always lemon yellow — it is the primary action color. */}
      <button
        type="button"
        onClick={send}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        disabled={disabled}
        aria-label="Send"
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: "50%",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          background: color.core.lemon,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: pressed ? "scale(0.92)" : "scale(1)",
          transition: `transform ${motion.durationBase} ${motion.easingBounce}, background ${motion.durationBase}, box-shadow ${motion.durationBase}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = color.core.lemonBright;
          e.currentTarget.style.boxShadow = "0 0 16px rgba(245,230,66,0.4)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = color.core.lemon;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <LemonSlice variant="send_button" size={24} segments={8} fillColor={color.semantic.textOnLemon} />
      </button>
    </div>
  );
}
