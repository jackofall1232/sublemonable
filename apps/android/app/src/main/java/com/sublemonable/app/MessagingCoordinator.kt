// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import android.content.Context
import android.util.Log
import com.sublemonable.app.crypto.SignalProtocolManager
import com.sublemonable.app.diagnostics.BootDiagnostics
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.data.ConversationRepository
import com.sublemonable.app.data.Message
import com.sublemonable.app.data.MessageEnvelope
import com.sublemonable.app.data.MessageRepository
import com.sublemonable.app.data.MessageState
import com.sublemonable.app.net.ApiClient
import com.sublemonable.app.net.WsClient
import com.sublemonable.app.notifications.MessagingNotifications
import kotlinx.coroutines.CancellationException
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
 *
 * The ONE exception to the no-logging rule is transport diagnostics: the
 * boot-stage markers in [bootstrapLoop], the socket-lifecycle lines in
 * [WsClient], and the send-path stage markers in [sendText] (e.g.
 * "firing POST /api/v1/register", "session minted", "X3DH session
 * established") plus the transport exception class/message on failure
 * (connect errors, HTTP status codes, certificate-pin mismatches). All of
 * these strings are compile-time constants or exception metadata — no
 * message content, keys, tokens, account ids, or envelope fields ever flow
 * through them, so nothing sensitive can leak. Without it, a
 * certificate-pinning failure or a dead relay is indistinguishable from
 * airplane mode — the app retries forever with no signal anywhere, client
 * or server (v1.5.3 shipped exactly that failure on the send path).
 *
 * Each such line goes to logcat AND to [BootDiagnostics] (an app-private,
 * capped, on-device file surfaced in Settings → Diagnostics), so a user with
 * no access to `adb` can still read and share the exact failure. See [diag].
 */
class MessagingCoordinator(
    private val appContext: Context,
    private val scope: CoroutineScope,
    private val signal: SignalProtocolManager,
    private val api: ApiClient,
    private val ws: WsClient,
    private val messages: MessageRepository,
    private val conversations: ConversationRepository,
    private val diagnostics: BootDiagnostics,
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

    /**
     * Set when the server revokes our session — UI returns to the lock gate.
     * @Volatile: written on the main thread, invoked from OkHttp callback threads.
     */
    @Volatile
    var onForcedLogout: (() -> Unit)? = null

    /**
     * Single-flight guard: only one boot/relink sequence runs at a time.
     * @Volatile: read/written from the main thread and OkHttp callback threads.
     */
    @Volatile
    private var linkJob: Job? = null

    init {
        ws.listener = this
        // Local burns (burn-on-read / burn-all) propagate to the other side.
        // The server routes the burn by peer_id, so resolve the conversation's
        // contact; a burn for an already-removed conversation has no peer to
        // notify and is dropped.
        messages.onMessageBurned = { message ->
            conversations.find(message.conversationId)?.let { conversation ->
                ws.burnMessage(message.id, conversation.contactId)
            }
        }
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
            // Boot-stage marker for the diagnostic log in onFailure below.
            // Stage names only — never data.
            var stage = "ensure-identity"
            val ok = runCatching {
                signal.ensureIdentity()
                if (api.accountId == null) {
                    if (registration == null) {
                        stage = "generate-prekeys"
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
                    stage = "register"
                    diag("boot[$attempt]: firing POST /api/v1/register")
                    registration?.invoke()
                    diag("boot[$attempt]: registration accepted by server")
                }
                stage = "create-session"
                val tokens = api.createSession(signal::signLoginChallenge)
                stage = "ws-connect"
                // Use the freshly-minted token directly rather than reading it
                // back through api.accessToken — that getter decrypts from
                // EncryptedSharedPreferences (Android Keystore) on every call,
                // and the return value is already non-null.
                ws.connect(tokens.accessToken)
            }.onFailure { e ->
                // A cancelled boot (normal teardown via stop()/logout) surfaces
                // here as CancellationException; rethrow it so structured
                // cancellation propagates and we don't log a false "failed"
                // line for an expected shutdown.
                if (e is CancellationException) throw e
                // Transport diagnostics only. The exception class + message is
                // what discriminates the failure: SSLPeerUnverifiedException
                // ("Certificate pinning failure!" — OkHttp lists the served
                // SPKI hashes next to the pinned ones) points at a pin
                // rotation; SSLHandshakeException / "no cipher suites in
                // common" / a TLS-version complaint points at the TLS-1.3-only
                // ConnectionSpec vs. the server's negotiation; Connect/
                // UnknownHost points at the relay simply being unreachable.
                // ApiException.responseBody, when present, is the server's
                // {"error": "<code>"} schema-validation reason (e.g.
                // "bad_identity_key") — the single most useful line for
                // diagnosing a register/session 400 without a second machine.
                val bodySuffix = (e as? ApiClient.ApiException)?.responseBody
                    ?.let { " server_error=$it" }
                    .orEmpty()
                diag(
                    "boot[$attempt]: failed at stage=$stage: " +
                        "${e.javaClass.name}: ${e.message}$bodySuffix",
                )
            }.isSuccess
            if (ok) {
                // ws.connect() only enqueues the socket open; the real
                // CONNECTED/DISCONNECTED transition (and any /ws handshake
                // failure) is delivered asynchronously via ws.connectionState,
                // which drives the UI connectivity badge — NOT observed here.
                // So this marks the boot chain reaching a live session and
                // handing the socket off, not a confirmed-open socket.
                diag("boot[$attempt]: session minted, socket handshake handed off")
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
            // Delay from the CURRENT attempt (0-based) so the first retry waits
            // the 1s base, not 2s — then advance (matches WsClient's backoff).
            delay(min(MAX_BACKOFF_MS, BASE_BACKOFF_MS shl min(attempt, MAX_BACKOFF_SHIFT)))
            attempt += 1
        }
    }

    fun stop() {
        _linking.value = false
        linkJob?.cancel()
        ws.presenceUpdate(online = false)
        ws.disconnect()
    }

    /**
     * Emit one privacy-safe boot-diagnostic line to BOTH logcat (when `adb` is
     * available) and the on-device [BootDiagnostics] file (Settings →
     * Diagnostics, for when it isn't). Callers must pass only fixed stage
     * strings + exception metadata — never user data. See the class kdoc.
     */
    private fun diag(line: String) {
        Log.w(TAG, line)
        diagnostics.record(line)
    }

    /**
     * Encrypt-then-send. X3DH session is established lazily on first send.
     *
     * Send-path stages mirror the boot loop's diagnostics: stage markers on
     * the (rare) first-message session setup, and stage + exception metadata
     * on any failure. Before this, every failure here was swallowed silently
     * by the runCatching — a dead prekey fetch or a failed X3DH looked
     * identical to the user simply never having tapped send.
     */
    fun sendText(conversation: Conversation, text: String, ttlSeconds: Int?, burnOnRead: Boolean) {
        scope.launch {
            val accountId = api.accountId ?: return@launch
            // Stage marker for the diagnostic log in onFailure below.
            // Stage names only — never data.
            var stage = "check-session"
            runCatching {
                if (!signal.hasSession(conversation.contactId)) {
                    stage = "fetch-prekey-bundle"
                    diag("send: no session — firing GET prekey bundle")
                    val bundle = api.fetchPreKeyBundle(conversation.contactId)
                    val pinned = conversation.pinnedIdentityKeyBase64
                    if (pinned != null && pinned != bundle.identityKeyBase64) {
                        // The relay returned a different identity key than the
                        // one exchanged out of band (contact QR). That is a
                        // key-substitution attempt — refuse to establish the
                        // session or send, and raise the warning badge instead
                        // of silently trusting the relay's key.
                        diag("send: identity key mismatch — send refused, warning raised")
                        conversations.flagIdentityMismatch(conversation.contactId)
                        return@launch
                    }
                    stage = "establish-session"
                    signal.establishSession(conversation.contactId, bundle)
                    diag("send: X3DH session established")
                    conversations.upsert(
                        conversation.copy(contactIdentityKeyBase64 = bundle.identityKeyBase64),
                    )
                }
                stage = "encrypt"
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

                stage = "ws-send"
                if (ws.sendMessage(envelope)) {
                    // The protocol has no sender-side delivery receipt event,
                    // so the sender's TTL clock starts at hand-off — the
                    // conservative choice (never outlives the recipient copy
                    // by more than transit time).
                    messages.markDelivered(envelope.id)
                } else {
                    // Socket not open: the message stays local in SENDING.
                    // Connection state only — never the envelope.
                    diag("send: hand-off failed — socket not open (${ws.connectionState.value})")
                }
            }.onFailure { e ->
                if (e is CancellationException) throw e
                // Same discrimination logic as the boot loop: exception class +
                // message + the server's {"error": code} body when present —
                // never message content, keys, or ids.
                val bodySuffix = (e as? ApiClient.ApiException)?.responseBody
                    ?.let { " server_error=$it" }
                    .orEmpty()
                diag("send: failed at stage=$stage: ${e.javaClass.name}: ${e.message}$bodySuffix")
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
        /** Logcat tag for boot-stage transport diagnostics — see class kdoc. */
        const val TAG = "SublemonableBoot"

        const val BASE_BACKOFF_MS = 1_000L
        const val MAX_BACKOFF_MS = 60_000L
        const val MAX_BACKOFF_SHIFT = 6
    }
}
