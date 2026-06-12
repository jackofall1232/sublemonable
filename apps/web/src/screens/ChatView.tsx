// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import { generateInvisibleWatermark } from "@sublemonable/crypto";
import { TTL_OPTIONS_SECONDS } from "@sublemonable/protocol";
import { ComposeBar, MessageBubble, SecurityBadge } from "@sublemonable/ui";
import { MESSAGES_CONTAINER_ID } from "../components/ScreenshotShield.js";
import { useApp } from "../store.js";

const TTL_LABELS: Record<number, string> = {
  30: "30s",
  60: "1m",
  300: "5m",
  3600: "1h",
  86400: "1d",
  604800: "1w",
};

export function ChatView({ peerId, onVerify }: { peerId: string; onVerify: () => void }) {
  const contact = useApp((s) => s.contacts[peerId]);
  const keyStore = useApp((s) => s.keyStore);
  const messages = useApp((s) => s.messages[peerId] ?? []);
  const accountId = useApp((s) => s.accountId);
  const sendMessage = useApp((s) => s.sendMessage);
  const openMessage = useApp((s) => s.openMessage);
  const finishBurn = useApp((s) => s.finishBurn);
  const expireMessage = useApp((s) => s.expireMessage);
  const [ttl, setTtl] = useState<number | null>(null);
  const [burnOnRead, setBurnOnRead] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark received messages opened when the conversation is on screen
  useEffect(() => {
    for (const m of messages) {
      if (m.direction === "received" && !m.opened) openMessage(peerId, m.id);
    }
  }, [messages, peerId, openMessage]);

  // Invisible watermark: encodes our account ID + timestamp into the chat
  // background for leak attribution if a capture is ever shared.
  const watermarkUrl = useMemo(() => {
    if (!accountId) return null;
    try {
      return generateInvisibleWatermark(accountId, peerId, 256, 256, "#0D0C00").toDataURL();
    } catch {
      return null;
    }
  }, [accountId, peerId]);

  if (!contact) return null;
  const verified = keyStore?.verifiedContacts[peerId] === contact.identityKey;

  return (
    <section className="flex h-full flex-1 flex-col bg-bg-primary">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-lemon to-lemon-zest font-display font-semibold text-ink-on-lemon">
            {contact.displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <h2 className="text-sm font-medium text-ink-primary">{contact.displayName}</h2>
            <SecurityBadge state={verified ? "verified" : "unverified"} onClick={onVerify} size={14} />
          </div>
        </div>
        <span className="font-mono text-[11px] text-lemon-deep">🔒 End-to-end encrypted</span>
      </header>

      <div
        id={MESSAGES_CONTAINER_ID}
        className="relative flex-1 overflow-y-auto px-4 py-4"
        style={watermarkUrl ? { backgroundImage: `url(${watermarkUrl})` } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            direction={m.direction}
            burnOnRead={m.burnOnRead}
            ttlSeconds={m.ttlSeconds ?? undefined}
            deliveredAt={m.deliveredAt}
            burning={m.burning}
            onBurned={() => finishBurn(peerId, m.id)}
            onExpired={() => expireMessage(peerId, m.id)}
            timestamp={new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          >
            {m.text}
          </MessageBubble>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-bg-secondary px-4 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">Self-destruct</span>
        <button
          onClick={() => setTtl(null)}
          className={`rounded-full px-2 py-0.5 text-[11px] ${ttl === null ? "bg-lemon text-ink-on-lemon" : "text-ink-secondary hover:text-lemon"}`}
        >
          off
        </button>
        {TTL_OPTIONS_SECONDS.map((s) => (
          <button
            key={s}
            onClick={() => setTtl(s)}
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${ttl === s ? "bg-lemon text-ink-on-lemon" : "text-ink-secondary hover:text-lemon"}`}
          >
            {TTL_LABELS[s]}
          </button>
        ))}
        <button
          onClick={() => setBurnOnRead((b) => !b)}
          aria-pressed={burnOnRead}
          className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] ${burnOnRead ? "bg-burn-orange text-bg-primary" : "text-ink-secondary hover:text-burn-orange"}`}
        >
          🔥 burn on read
        </button>
      </div>

      <ComposeBar onSend={(text) => void sendMessage(peerId, text, { ttlSeconds: ttl, burnOnRead })} />
    </section>
  );
}
