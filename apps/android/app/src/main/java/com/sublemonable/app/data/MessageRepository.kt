// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/**
 * LOCAL-ONLY, IN-MEMORY storage of decrypted messages.
 *
 * Plaintext never touches disk: there is no database, no file cache, and the
 * process dying takes every decrypted message with it — by design, for an
 * ephemeral messenger. Enforces:
 *
 *  - TTL: countdown starts at delivery (timer_starts: on_delivery); when the
 *    timer fires the message burns locally (particle animation, then removal).
 *  - Burn-on-read: first read triggers immediate destruction and notifies the
 *    caller so a `message.burn` signal reaches the other side via WebSocket.
 */
class MessageRepository(
    private val scope: CoroutineScope,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    private val _messages = MutableStateFlow<Map<String, List<Message>>>(emptyMap())

    /** conversationId -> ordered messages. */
    val messages: StateFlow<Map<String, List<Message>>> = _messages.asStateFlow()

    private val ttlJobs = ConcurrentHashMap<String, Job>()

    /** Invoked when a message burns (read or TTL) so the WS layer can signal it. */
    var onMessageBurned: ((Message) -> Unit)? = null

    fun conversationMessages(conversationId: String): List<Message> =
        _messages.value[conversationId].orEmpty()

    fun addOutgoing(message: Message) {
        upsert(message)
    }

    /** Incoming messages are delivered the moment they arrive. */
    fun addIncoming(message: Message) {
        val delivered = message.copy(
            state = MessageState.DELIVERED,
            deliveredAtMs = message.deliveredAtMs ?: clock(),
        )
        upsert(delivered)
        scheduleTtl(delivered)
    }

    /** Sent message confirmed delivered — the TTL countdown starts NOW. */
    fun markDelivered(messageId: String) {
        val updated = update(messageId) {
            it.copy(state = MessageState.DELIVERED, deliveredAtMs = it.deliveredAtMs ?: clock())
        }
        updated?.let(::scheduleTtl)
    }

    /**
     * Marks a message read. For burn-on-read messages this is the moment of
     * destruction: the burn starts immediately and the peer is notified.
     */
    fun markRead(messageId: String) {
        val message = find(messageId) ?: return
        if (message.state == MessageState.BURNING) return
        if (message.burnOnRead && !message.isMine) {
            burn(messageId, notifyPeer = true)
        } else if (message.state != MessageState.READ) {
            update(messageId) { it.copy(state = MessageState.READ) }
        }
    }

    /**
     * Burns a message: flips it to BURNING so the UI plays the particle
     * dissolve (600ms, upward), then removes it permanently.
     */
    fun burn(messageId: String, notifyPeer: Boolean) {
        ttlJobs.remove(messageId)?.cancel()
        val burning = update(messageId) { it.copy(state = MessageState.BURNING) } ?: return
        if (notifyPeer) onMessageBurned?.invoke(burning)
        scope.launch {
            // Let the particle dissolve finish before the message ceases to
            // exist (matches ui.theme.Motion.DurationDramaticMs — 600ms).
            delay(BURN_ANIMATION_MS)
            remove(messageId)
        }
    }

    /** Burns every message in a conversation (the "burn all" header action). */
    fun burnAll(conversationId: String, notifyPeer: Boolean = true) {
        conversationMessages(conversationId)
            .filter { it.state != MessageState.BURNING }
            .forEach { burn(it.id, notifyPeer) }
    }

    /** Remote side destroyed a message — mirror it locally, no echo back. */
    fun onRemoteBurn(messageId: String) {
        burn(messageId, notifyPeer = false)
    }

    /** Wipes everything decrypted from memory (logout / session revoked). */
    fun clearAll() {
        ttlJobs.values.forEach(Job::cancel)
        ttlJobs.clear()
        _messages.value = emptyMap()
    }

    // -----------------------------------------------------------------------

    private fun scheduleTtl(message: Message) {
        val ttlSeconds = message.ttlSeconds ?: return
        val deliveredAt = message.deliveredAtMs ?: return
        if (ttlJobs.containsKey(message.id)) return
        val expiresAt = deliveredAt + ttlSeconds * 1000L
        ttlJobs[message.id] = scope.launch {
            val wait = expiresAt - clock()
            if (wait > 0) delay(wait)
            // TTL enforced both sides — each side burns locally on its own
            // clock, so no peer notification is needed here.
            burn(message.id, notifyPeer = false)
        }
    }

    private fun find(messageId: String): Message? =
        _messages.value.values.asSequence().flatten().firstOrNull { it.id == messageId }

    private fun upsert(message: Message) {
        _messages.value = _messages.value.toMutableMap().apply {
            val list = get(message.conversationId).orEmpty()
            val existing = list.indexOfFirst { it.id == message.id }
            put(
                message.conversationId,
                if (existing >= 0) {
                    list.toMutableList().also { it[existing] = message }
                } else {
                    list + message
                },
            )
        }
    }

    private fun update(messageId: String, transform: (Message) -> Message): Message? {
        val current = find(messageId) ?: return null
        val updated = transform(current)
        upsert(updated)
        return updated
    }

    private fun remove(messageId: String) {
        ttlJobs.remove(messageId)?.cancel()
        _messages.value = _messages.value.mapValues { (_, list) ->
            list.filterNot { it.id == messageId }
        }
    }

    companion object {
        /** Duration of the burn particle dissolve before hard removal. */
        const val BURN_ANIMATION_MS = 600L
    }
}
