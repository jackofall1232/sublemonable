// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import android.content.Context
import com.sublemonable.app.crypto.SignalProtocolManager
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.data.ConversationRepository
import com.sublemonable.app.data.Message
import com.sublemonable.app.data.MessageEnvelope
import com.sublemonable.app.data.MessageRepository
import com.sublemonable.app.data.MessageState
import com.sublemonable.app.net.ApiClient
import com.sublemonable.app.net.WsClient
import com.sublemonable.app.notifications.MessagingNotifications
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.coroutines.coroutineContext
import kotlin.math.min

/**
 * Glue between crypto, transport and the in-memory repositories. This is the
 * ONLY place that touches plaintext between decryption and the UI — and it
 * never logs, persists, or transmits it.
 *
 * Network failures are swallowed silently into offline state: an error path
 * that logged envelope details would be a privacy bug, so there is nothing
 * to log by construction. Instead of failing dead, the boot sequence retries
 * on a capped backoff so a transient outage at unlock time can't strand the
 * account unregistered and offline forever (see [start]).
 */
class MessagingCoordinator(
    private val appContext: Context,
    private val scope: CoroutineScope,
    private val signal: SignalProtocolManager,
    private val api: ApiClient,
    private val ws: WsClient,
    private val messages: MessageRepository,
    private val conversations: ConversationRepository,
) : WsClient.Listener {

    private val _typingPeers = MutableStateFlow<Set<String>>(emptySet())
    val typingPeers: StateFlow<Set<String>> = _typingPeers.asStateFlow()

    /**
     * True while the app is unlocked and EXPECTS to be connected — set in
     * [start] and cleared only on an intentional teardown ([stop],
     * [onSessionRevoked], [deleteAccountAndWipe]). Combined with the raw socket
     * state it keeps the UI showing "connecting" (never a silent, dead
     * "offline") whenever we intend to be online but the socket is momentarily
     * down and WsClient is retrying.
     */
    private val _linking = MutableStateFlow(false)

    /** High-level connectivity for the UI: boot supervisor + socket combined. */
    enum class Connectivity { OFFLINE, CONNECTING, ONLINE }

    val connectivity: StateFlow<Connectivity> =
        combine(ws.connectionState, _linking) { wsState, linking ->
            when (wsState) {
                WsClient.ConnectionState.CONNECTED -> Connectivity.ONLINE
                WsClient.ConnectionState.CONNECTING -> Connectivity.CONNECTING
                WsClient.ConnectionState.DISCONNECTED ->
                    if (linking) Connectivity.CONNECTING else Connectivity.OFFLINE
            }
        }.stateIn(scope, SharingStarted.Eagerly, Connectivity.OFFLINE)

    /** Set when the server revokes our session — UI returns to the lock gate. */
    var onForcedLogout: (() -> Unit)? = null

    /** Single-flight guard: only one boot/relink sequence runs at a time. */
    private var linkJob: Job? = null

    init {
        ws.listener = this
        // Local burns (burn-on-read / burn-all) propagate to the other side.
        messages.onMessageBurned = { message -> ws.burnMessage(message.id) }
    }

    /**
     * Boot sequence: identity -> registration (first run) -> challenge-signed
     * session -> WebSocket. Safe to call repeatedly (single-flight), safe to
     * fail offline. Retries the whole sequence on a capped exponential backoff
     * until it succeeds, so registration and connection come up automatically
     * once the relay is reachable — no manual user action, ever.
     *
     * Also used to re-authenticate after [onAuthExpired]: with an account
     * already registered, the loop skips registration and just mints a fresh
     * session + socket.
     */
    @Synchronized
    fun start() {
        if (linkJob?.isActive == true) return
        _linking.value = true
        linkJob = scope.launch { bootstrapLoop() }
    }

    private suspend fun bootstrapLoop() {
        // One-time prekeys are generated (and persisted) at most ONCE and reused
        // across register retries: regenerating per attempt would orphan a
        // signed prekey + a full batch into the encrypted store on every failed
        // register. Identity generation is idempotent and stays inside the loop,
        // so a transient keystore hiccup retries instead of dead-ending the loop
        // with nothing scheduled to recover it.
        var registration: (suspend () -> Unit)? = null
        var attempt = 0
        while (coroutineContext.isActive && _linking.value) {
            val ok = runCatching {
                signal.ensureIdentity()
                if (api.accountId == null) {
                    if (registration == null) {
                        val signedPreKey = signal.generateSignedPreKey()
                        val oneTimePreKeys = signal.generateOneTimePreKeys()
                        registration = suspend {
                            api.register(
                                identityKeyBase64 = signal.localIdentityPublicKeyBase64(),
                                registrationId = signal.localRegistrationId(),
                                signedPreKey = signedPreKey,
                                oneTimePreKeys = oneTimePreKeys,
                            )
                            // register() returns the new account id; the loop
                            // only needs its Unit side effect (accountId stored).
                            Unit
                        }
                    }
                    // NOTE: if the register POST reaches the server but the
                    // response is lost (process death mid-flight), accountId is
                    // never stored and a retry mints a second, orphaned account
                    // (public keys only). The client-side null-guard +
                    // single-flight prevents the common case, not this window.
                    registration?.invoke()
                }
                api.createSession(signal::signLoginChallenge)
                val token = api.accessToken ?: error("no access token issued")
                ws.connect(token)
            }.isSuccess
            if (ok) {
                // Reaching a live socket IS success. Signed-prekey rotation is
                // best-effort and must NOT fail the boot — a failed upload here
                // would otherwise tear down the healthy socket on the next
                // iteration. WsClient owns socket-level reconnects from here;
                // auth expiry comes back through onAuthExpired().
                runCatching {
                    signal.rotateSignedPreKeyIfNeeded()?.let { rotated ->
                        api.uploadPreKeys(emptyList(), rotated)
                    }
                }
                return
            }
            attempt += 1
            delay(min(MAX_BACKOFF_MS, BASE_BACKOFF_MS shl min(attempt, MAX_BACKOFF_SHIFT)))
        }
    }

    fun stop() {
        _linking.value = false
        linkJob?.cancel()
        ws.presenceUpdate(online = false)
        ws.disconnect()
    }

    /** Encrypt-then-send. X3DH session is established lazily on first send. */
    fun sendText(conversation: Conversation, text: String, ttlSeconds: Int?, burnOnRead: Boolean) {
        scope.launch {
            val accountId = api.accountId ?: return@launch
            runCatching {
                if (!signal.hasSession(conversation.contactId)) {
                    val bundle = api.fetchPreKeyBundle(conversation.contactId)
                    signal.establishSession(conversation.contactId, bundle)
                    conversations.upsert(
                        conversation.copy(contactIdentityKeyBase64 = bundle.identityKeyBase64),
                    )
                }
                val encrypted = signal.encrypt(conversation.contactId, text.toByteArray(Charsets.UTF_8))
                val envelope = MessageEnvelope(
                    id = UUID.randomUUID().toString(),
                    senderId = accountId,
                    recipientId = conversation.contactId,
                    ciphertext = encrypted.ciphertextBase64,
                    ephemeralKey = encrypted.ephemeralKeyBase64,
                    preKeyId = encrypted.preKeyId,
                    messageNumber = encrypted.messageNumber,
                    // libsignal's Java API does not expose the previous chain
                    // length; the field is carried for protocol compatibility.
                    previousChainLength = 0,
                    timestamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
                    ttlSeconds = ttlSeconds,
                    burnOnRead = burnOnRead,
                    mediaType = MessageEnvelope.MEDIA_TEXT,
                )

                val local = Message(
                    id = envelope.id,
                    conversationId = conversation.id,
                    text = text,
                    isMine = true,
                    timestampMs = System.currentTimeMillis(),
                    ttlSeconds = ttlSeconds,
                    burnOnRead = burnOnRead,
                    state = MessageState.SENDING,
                )
                messages.addOutgoing(local)
                conversations.onOutgoingMessage(conversation.id)

                if (ws.sendMessage(envelope)) {
                    // The protocol has no sender-side delivery receipt event,
                    // so the sender's TTL clock starts at hand-off — the
                    // conservative choice (never outlives the recipient copy
                    // by more than transit time).
                    messages.markDelivered(envelope.id)
                }
            }
        }
    }

    fun sendTyping(conversation: Conversation, started: Boolean) {
        if (started) ws.typingStart(conversation.contactId) else ws.typingStop(conversation.contactId)
    }

    /** Wipes the server account AND the local keys/messages. Irreversible. */
    fun deleteAccountAndWipe(onComplete: () -> Unit) {
        scope.launch {
            _linking.value = false
            linkJob?.cancel()
            runCatching { api.deleteAccount() }
            ws.disconnect()
            messages.clearAll()
            conversations.clearAll()
            onComplete()
        }
    }

    // -- inbound WebSocket events ---------------------------------------------

    override fun onMessageDeliver(envelope: MessageEnvelope) {
        scope.launch {
            runCatching {
                val plaintext = signal.decrypt(
                    remoteAccountId = envelope.senderId,
                    ciphertextBase64 = envelope.ciphertext,
                    isPreKeyMessage = envelope.ephemeralKey != null,
                )
                val conversation = conversations.onIncomingMessage(envelope.senderId)
                messages.addIncoming(
                    Message(
                        id = envelope.id,
                        conversationId = conversation.id,
                        text = String(plaintext, Charsets.UTF_8),
                        isMine = false,
                        timestampMs = runCatching {
                            Instant.parse(envelope.timestamp).toEpochMilli()
                        }.getOrDefault(System.currentTimeMillis()),
                        ttlSeconds = envelope.ttlSeconds,
                        burnOnRead = envelope.burnOnRead,
                        state = MessageState.DELIVERED,
                    ),
                )
                // Ack AFTER successful decrypt + store: this is what makes
                // the server delete its copy (store-and-forward, zero
                // retention).
                ws.ackMessage(envelope.id)
                // Content-free notification: always just "New message".
                MessagingNotifications.showNewMessage(appContext)
            }
        }
    }

    override fun onMessageBurned(messageId: String) {
        messages.onRemoteBurn(messageId)
    }

    override fun onTyping(senderId: String, started: Boolean) {
        _typingPeers.value = if (started) {
            _typingPeers.value + senderId
        } else {
            _typingPeers.value - senderId
        }
    }

    override fun onPresence(userId: String, online: Boolean) {
        // Presence is intentionally not surfaced in v1 UI.
    }

    override fun onPreKeyLow(remaining: Int) {
        scope.launch {
            runCatching {
                api.uploadPreKeys(signal.generateOneTimePreKeys())
            }
        }
    }

    override fun onSessionRevoked() {
        _linking.value = false
        linkJob?.cancel()
        messages.clearAll()
        api.clearTokens()
        onForcedLogout?.invoke()
    }

    override fun onAuthExpired() {
        // Token rejected mid-session. Wait for any in-flight boot to finish
        // (it's the one that just connected), THEN re-run the boot sequence —
        // registration is skipped (account exists), so this re-mints a fresh
        // session + socket. Latching via join() avoids the race where start()
        // no-ops against a still-active linkJob and the relink is lost.
        val current = linkJob
        scope.launch {
            current?.join()
            // Re-check intent after the join window: a teardown
            // (stop/logout/deleteAccount) may have run in between, and relinking
            // then would resurrect the connection — or, post-delete, silently
            // register a brand-new account.
            if (_linking.value) start()
        }
    }

    override fun onServerError(code: String, message: String) {
        // Server error codes carry no user data; v1 surfaces them only as
        // connection state, never as raw strings.
    }

    private companion object {
        const val BASE_BACKOFF_MS = 1_000L
        const val MAX_BACKOFF_MS = 60_000L
        const val MAX_BACKOFF_SHIFT = 6
    }
}
