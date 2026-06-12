// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { MessageEnvelope } from "./envelope.js";

// ── Client → server ──────────────────────────────────────────────────────────

export interface MessageSendEvent {
  type: "message.send";
  envelope: MessageEnvelope;
}

/** Delivery confirmation — triggers immediate server-side deletion of the envelope. */
export interface MessageAckEvent {
  type: "message.ack";
  message_id: string;
}

/** Request early destruction of a message on all devices. */
export interface MessageBurnEvent {
  type: "message.burn";
  message_id: string;
  peer_id: string;
}

/**
 * Typing and presence signals carry an encrypted payload, not plaintext state —
 * the server relays them without learning what they say.
 */
export interface TypingStartEvent {
  type: "typing.start";
  peer_id: string;
  ciphertext: string;
}

export interface TypingStopEvent {
  type: "typing.stop";
  peer_id: string;
  ciphertext: string;
}

export interface PresenceUpdateEvent {
  type: "presence.update";
  ciphertext: string;
}

export type ClientEvent =
  | MessageSendEvent
  | MessageAckEvent
  | MessageBurnEvent
  | TypingStartEvent
  | TypingStopEvent
  | PresenceUpdateEvent;

// ── Server → client ──────────────────────────────────────────────────────────

export interface MessageDeliverEvent {
  type: "message.deliver";
  envelope: MessageEnvelope;
}

/** The recipient destroyed a message (burn-on-read or manual burn). */
export interface MessageBurnedEvent {
  type: "message.burned";
  message_id: string;
  peer_id: string;
}

/** One-time prekey stock is low — client should upload a fresh batch. */
export interface PrekeyLowEvent {
  type: "prekey.low";
  remaining: number;
}

/** Force logout — the session was revoked. */
export interface SessionRevokedEvent {
  type: "session.revoked";
}

export interface ErrorEvent {
  type: "error";
  /** Machine-readable code; never contains message content or user data. */
  code: string;
}

export type ServerEvent =
  | MessageDeliverEvent
  | MessageBurnedEvent
  | PrekeyLowEvent
  | SessionRevokedEvent
  | ErrorEvent
  // typing/presence signals are relayed to the peer verbatim
  | TypingStartEvent
  | TypingStopEvent
  | PresenceUpdateEvent;

export const CLIENT_EVENT_TYPES = [
  "message.send",
  "message.ack",
  "message.burn",
  "typing.start",
  "typing.stop",
  "presence.update",
] as const;

export const SERVER_EVENT_TYPES = [
  "message.deliver",
  "message.burned",
  "prekey.low",
  "session.revoked",
  "error",
  "typing.start",
  "typing.stop",
  "presence.update",
] as const;
