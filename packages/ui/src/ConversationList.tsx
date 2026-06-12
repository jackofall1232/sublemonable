// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { color, typography } from "./tokens.js";

export interface Conversation {
  id: string;
  displayName: string;
  verified: boolean;
  unreadCount: number;
  lastActivityLabel?: string;
}

export interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  return (
    <nav aria-label="Conversations" style={{ display: "flex", flexDirection: "column" }}>
      {conversations.map((c) => (
        <ConversationListItem key={c.id} conversation={c} active={c.id === activeId} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function ConversationListItem({
  conversation: c,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 16px",
        border: "none",
        textAlign: "left",
        cursor: "pointer",
        background: active
          ? color.semantic.backgroundElevated
          : hovered
            ? color.semantic.backgroundSecondary
            : "transparent",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${color.core.lemon}, ${color.core.lemonZest})`,
          border: c.verified ? `2px solid ${color.semantic.verifiedGreen}` : "2px solid transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: color.semantic.textOnLemon,
          fontFamily: typography.display.family,
          fontWeight: 600,
        }}
      >
        {c.displayName.charAt(0).toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            color: color.semantic.textPrimary,
            fontFamily: typography.body.family,
            fontWeight: 500,
            fontSize: "0.9375rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.displayName}
        </span>
        {/* Preview text never shows content — by design. */}
        <span
          style={{
            display: "block",
            color: color.semantic.textMuted,
            fontFamily: typography.body.family,
            fontSize: "0.8125rem",
          }}
        >
          Encrypted message
        </span>
      </span>
      {c.lastActivityLabel && (
        <span
          style={{
            color: color.semantic.textMuted,
            fontFamily: typography.mono.family,
            fontSize: "0.6875rem",
          }}
        >
          {c.lastActivityLabel}
        </span>
      )}
      {c.unreadCount > 0 && (
        <span
          style={{
            background: color.core.lemon,
            color: color.semantic.textOnLemon,
            borderRadius: 9999,
            minWidth: 20,
            padding: "2px 7px",
            textAlign: "center",
            fontFamily: typography.body.family,
            fontWeight: 500,
            fontSize: "0.75rem",
          }}
        >
          {c.unreadCount}
        </span>
      )}
    </button>
  );
}
