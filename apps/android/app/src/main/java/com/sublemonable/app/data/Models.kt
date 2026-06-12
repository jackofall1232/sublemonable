// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

/**
 * A DECRYPTED message. Lives ONLY in memory (see [MessageRepository]) —
 * plaintext is never written to disk, never logged, never serialized.
 */
data class Message(
    val id: String,
    val conversationId: String,
    val text: String,
    val isMine: Boolean,
    /** Epoch millis when composed/received. */
    val timestampMs: Long,
    /** Self-destruct TTL in seconds; null means the message does not expire. */
    val ttlSeconds: Int?,
    val burnOnRead: Boolean,
    /** Epoch millis of delivery — TTL countdown starts here (timer_starts: on_delivery). */
    val deliveredAtMs: Long? = null,
    val state: MessageState = MessageState.SENDING,
)

enum class MessageState {
    SENDING,
    SENT,
    DELIVERED,
    READ,
    /** Burn animation in flight — particles dissolving upward. */
    BURNING,
}

data class Conversation(
    val id: String,
    /** Routing UUID of the contact — never shown to other users directly. */
    val contactId: String,
    /** Optional display name; not used for routing. */
    val displayName: String,
    /** Base64 identity key of the contact, for safety-number verification. */
    val contactIdentityKeyBase64: String? = null,
    val verified: Boolean = false,
    val keyChanged: Boolean = false,
    val unreadCount: Int = 0,
    val lastActivityMs: Long = 0L,
)
