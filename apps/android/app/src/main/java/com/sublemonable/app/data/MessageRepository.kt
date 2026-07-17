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
import kotlinx.coroutines.flow.update
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
 *  - Burn-on-read: the first read starts a [BURN_ON_READ_DELAY_MS] grace
 *    window so the recipient can actually read the message, THEN destroys it
 *    and notifies the caller so a `message.burn` signal reaches the other
 *    side via WebSocket. The burn arriving at the sender doubles as the read
 *    confirmation for these messages, so the delay is deliberate design, not
 *    slack: burn time ≈ read time + the grace window.
 *
 * Hit concurrently from the main thread (read marks out of the chat screen)
 * and coroutine dispatchers (WS delivery, peer receipts, TTL and read-burn
 * timers) — every state mutation is a single atomic CAS, and guarded
 * transitions carry their guard INTO the CAS (see [update]) so racing
 * writers can neither lose updates nor double-fire a transition.
 */
class MessageRepository(
    private val scope: CoroutineScope,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    private val _messages = MutableStateFlow<Map<String, List<Message>>>(emptyMap())

    /** conversationId -> ordered messages. */
    val messages: StateFlow<Map<String, List<Message>>> = _messages.asStateFlow()

    private val ttlJobs = ConcurrentHashMap<String, Job>()
    private val readBurnJobs = ConcurrentHashMap<String, Job>()

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
     * Marks an incoming message read. Burn-on-read messages flip to READ
     * immediately but stay visible for [BURN_ON_READ_DELAY_MS] before the
     * burn fires (and notifies the peer) — see the class kdoc.
     *
     * @return true when THIS call transitioned a regular (non-burn) incoming
     *   message to READ — the one moment a read receipt should fire. Repeat
     *   calls, own messages, burning messages, and burn-on-read messages
     *   (whose burn signal IS the read confirmation) all return false.
     */
    fun markRead(messageId: String): Boolean {
        // isMine/burnOnRead are immutable per message — safe to route on a
        // snapshot read; the state transition itself is guarded in the CAS.
        val message = find(messageId) ?: return false
        if (message.isMine) return false
        if (message.burnOnRead) {
            scheduleReadBurn(messageId)
            return false
        }
        return update(
            messageId,
            precondition = { it.state != MessageState.BURNING && it.state != MessageState.READ },
            transform = { it.copy(state = MessageState.READ) },
        ) != null
    }

    /** The peer's read receipt arrived — flip our outgoing copy to READ. */
    fun onPeerRead(messageId: String) {
        update(
            messageId,
            precondition = {
                it.isMine && it.state != MessageState.BURNING && it.state != MessageState.READ
            },
            transform = { it.copy(state = MessageState.READ) },
        )
    }

    /**
     * Burns a message: flips it to BURNING so the UI plays the particle
     * dissolve (600ms, upward), then removes it permanently.
     */
    fun burn(messageId: String, notifyPeer: Boolean) {
        ttlJobs.remove(messageId)?.cancel()
        // A pending read-burn racing this burn (burn-all, remote burn, TTL)
        // must not fire a second burn after its grace window.
        readBurnJobs.remove(messageId)?.cancel()
        // Guard inside the CAS: racing burns (remote + local) win the flip
        // to BURNING exactly once, so the peer is never notified twice.
        val burning = update(
            messageId,
            precondition = { it.state != MessageState.BURNING },
            transform = { it.copy(state = MessageState.BURNING) },
        ) ?: return
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
        readBurnJobs.values.forEach(Job::cancel)
        readBurnJobs.clear()
        _messages.value = emptyMap()
    }

    // -----------------------------------------------------------------------

    /**
     * Burn-on-read, phase one: the message is READ (visible, counting down),
     * and the actual burn — including the peer notification that acts as the
     * read confirmation — fires after the grace window.
     */
    private fun scheduleReadBurn(messageId: String) {
        if (readBurnJobs.containsKey(messageId)) return
        update(
            messageId,
            precondition = { it.state != MessageState.BURNING && it.state != MessageState.READ },
            transform = { it.copy(state = MessageState.READ) },
        ) ?: return
        readBurnJobs[messageId] = scope.launch {
            delay(BURN_ON_READ_DELAY_MS)
            // Drop our own handle BEFORE burning so burn()'s cancellation of
            // pending read-burns can never cancel the job executing it.
            readBurnJobs.remove(messageId)
            burn(messageId, notifyPeer = true)
        }
    }

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
        _messages.update { current ->
            val list = current[message.conversationId].orEmpty()
            val existing = list.indexOfFirst { it.id == message.id }
            current.toMutableMap().apply {
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
    }

    /**
     * Atomically finds and transforms one message when [precondition] holds —
     * a single CAS loop over the state map, so writers on different threads
     * can neither lose each other's updates nor double-fire a guarded
     * transition (e.g. two racing burns both notifying the peer). Both
     * lambdas may re-run on CAS contention and must stay pure. Returns the
     * transformed message, or null when it is missing or the precondition
     * rejected it.
     */
    private fun update(
        messageId: String,
        precondition: (Message) -> Boolean = { true },
        transform: (Message) -> Message,
    ): Message? {
        var applied: Message? = null
        _messages.update { current ->
            applied = null
            val conversationId = current.entries
                .firstOrNull { (_, list) -> list.any { it.id == messageId } }
                ?.key
                ?: return@update current
            val list = current.getValue(conversationId)
            val index = list.indexOfFirst { it.id == messageId }
            val message = list[index]
            if (!precondition(message)) return@update current
            val transformed = transform(message)
            applied = transformed
            current.toMutableMap().apply {
                put(conversationId, list.toMutableList().also { it[index] = transformed })
            }
        }
        return applied
    }

    private fun remove(messageId: String) {
        ttlJobs.remove(messageId)?.cancel()
        _messages.update { current ->
            current.mapValues { (_, list) -> list.filterNot { it.id == messageId } }
        }
    }

    companion object {
        /** Duration of the burn particle dissolve before hard removal. */
        const val BURN_ANIMATION_MS = 600L

        /**
         * How long a burn-on-read message stays readable after it is first
         * seen. The window is the read time — burning at first render gave
         * the recipient zero time to read anything.
         */
        const val BURN_ON_READ_DELAY_MS = 5_000L
    }
}
