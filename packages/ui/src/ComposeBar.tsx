// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { SendButton } from "./SendButton.js";
import { color, motion, typography } from "./tokens.js";

export interface ComposeBarProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  /** Long-press the send button to compose a dead drop (Ghost/Stealth modes). */
  onSendAsDeadDrop?: (text: string) => void;
}

export function ComposeBar({
  onSend,
  onAttach,
  disabled = false,
  sending = false,
  placeholder = "Message",
  onSendAsDeadDrop,
}: ComposeBarProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const sendAsDeadDrop = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || !onSendAsDeadDrop) return;
    onSendAsDeadDrop(trimmed);
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
      {/* The send button is always lemon yellow — it is the primary action color.
          Long-press surfaces "Send as dead drop" when the handler is provided. */}
      <SendButton
        onSend={send}
        disabled={disabled}
        sending={sending}
        onLongPress={onSendAsDeadDrop ? sendAsDeadDrop : undefined}
      />
    </div>
  );
}
