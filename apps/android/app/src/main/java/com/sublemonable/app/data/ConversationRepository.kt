// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-memory conversation index. Like messages, the conversation list is never
 * persisted to disk in v1 — contacts are re-established by QR exchange.
 * Conversation previews NEVER contain message content; the UI always renders
 * the literal string "Encrypted message".
 */
class ConversationRepository(
    private val clock: () -> Long = System::currentTimeMillis,
) {

    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations: StateFlow<List<Conversation>> = _conversations.asStateFlow()

    fun find(conversationId: String): Conversation? =
        _conversations.value.firstOrNull { it.id == conversationId }

    fun findByContact(contactId: String): Conversation? =
        _conversations.value.firstOrNull { it.contactId == contactId }

    fun upsert(conversation: Conversation) {
        _conversations.value = _conversations.value
            .filterNot { it.id == conversation.id }
            .plus(conversation)
            .sortedByDescending { it.lastActivityMs }
    }

    /** Bumps activity + unread counter when a message arrives. */
    fun onIncomingMessage(contactId: String, displayName: String? = null): Conversation {
        val existing = findByContact(contactId)
        val updated = existing?.copy(
            unreadCount = existing.unreadCount + 1,
            lastActivityMs = clock(),
        ) ?: Conversation(
            id = contactId,
            contactId = contactId,
            displayName = displayName ?: "Unknown contact",
            unreadCount = 1,
            lastActivityMs = clock(),
        )
        upsert(updated)
        return updated
    }

    fun onOutgoingMessage(conversationId: String) {
        find(conversationId)?.let { upsert(it.copy(lastActivityMs = clock())) }
    }

    fun markConversationRead(conversationId: String) {
        find(conversationId)?.let { upsert(it.copy(unreadCount = 0)) }
    }

    fun setVerified(conversationId: String, verified: Boolean) {
        find(conversationId)?.let {
            upsert(it.copy(verified = verified, keyChanged = if (verified) false else it.keyChanged))
        }
    }

    /** Identity key changed for a contact — surface the warning badge. */
    fun flagKeyChanged(contactId: String, newIdentityKeyBase64: String) {
        findByContact(contactId)?.let {
            upsert(
                it.copy(
                    keyChanged = true,
                    verified = false,
                    contactIdentityKeyBase64 = newIdentityKeyBase64,
                ),
            )
        }
    }

    fun remove(conversationId: String) {
        _conversations.value = _conversations.value.filterNot { it.id == conversationId }
    }

    fun clearAll() {
        _conversations.value = emptyList()
    }
}
