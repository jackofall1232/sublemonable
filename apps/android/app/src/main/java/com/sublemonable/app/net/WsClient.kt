// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.net

import com.sublemonable.app.data.MessageEnvelope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import kotlin.math.min

/**
 * Authenticated WebSocket (WS /ws) for real-time message delivery.
 *
 * Event names mirror server.websocket_events exactly:
 *  client -> server: message.send, message.ack, message.burn,
 *                    typing.start, typing.stop, presence.update
 *  server -> client: message.deliver, message.burned, prekey.low,
 *                    session.revoked, error
 *
 * Acking a delivery is what triggers the server to DELETE the stored
 * envelope (store-and-forward only) — see [ackMessage].
 */
class WsClient(
    private val wsUrl: String,
    private var client: OkHttpClient,
    private val scope: CoroutineScope,
) {

    /** Inbound events, fully typed. No raw frames escape this class. */
    interface Listener {
        /** Encrypted envelope arrived. Decrypt, store, then [ackMessage]. */
        fun onMessageDeliver(envelope: MessageEnvelope)

        /** The recipient destroyed a message — burn our copy too. */
        fun onMessageBurned(messageId: String)

        fun onTyping(senderId: String, started: Boolean)

        fun onPresence(userId: String, online: Boolean)

        /** Server-side one-time prekey stock is low — upload another batch. */
        fun onPreKeyLow(remaining: Int)

        /** Force logout: wipe in-memory state and re-authenticate. */
        fun onSessionRevoked()

        /**
         * The JWT was rejected during the WebSocket handshake (401/403).
         * Reconnecting with the same dead token would spin forever, so the
         * coordinator re-authenticates and calls [connect] with a fresh token
         * instead of the socket retrying on its own.
         */
        fun onAuthExpired()

        /** Server error event. [message] is a server code, never content. */
        fun onServerError(code: String, message: String)
    }

    enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED }

    var listener: Listener? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    // @Volatile: written on coroutine (Dispatchers.Default) threads but read on
    // OkHttp callback threads — the socketListener staleness guard and the
    // intentional-close guard depend on cross-thread visibility.
    @Volatile
    private var webSocket: WebSocket? = null
    @Volatile
    private var reconnectJob: Job? = null
    @Volatile
    private var reconnectAttempts = 0
    @Volatile
    private var intentionallyClosed = false
    @Volatile
    private var currentToken: String? = null

    fun updateClient(newClient: OkHttpClient) {
        client = newClient
    }

    /** Opens the socket with the current JWT. Reconnects automatically. */
    fun connect(accessToken: String) {
        currentToken = accessToken
        intentionallyClosed = false
        openSocket()
    }

    fun disconnect() {
        intentionallyClosed = true
        reconnectJob?.cancel()
        webSocket?.close(CLOSE_NORMAL, "client closing")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    // -- outbound events ------------------------------------------------------

    /** message.send — encrypted envelope + recipient id. */
    fun sendMessage(envelope: MessageEnvelope): Boolean =
        send("message.send", JSONObject().apply {
            put("recipient_id", envelope.recipientId)
            put("envelope", envelope.toJson())
        })

    /**
     * message.ack — delivery confirmation. CRITICAL: the server deletes the
     * stored envelope immediately upon receiving this (zero retention).
     */
    fun ackMessage(messageId: String): Boolean =
        send("message.ack", JSONObject().put("message_id", messageId))

    /** message.burn — request early destruction of a message everywhere. */
    fun burnMessage(messageId: String): Boolean =
        send("message.burn", JSONObject().put("message_id", messageId))

    fun typingStart(recipientId: String): Boolean =
        send("typing.start", JSONObject().put("recipient_id", recipientId))

    fun typingStop(recipientId: String): Boolean =
        send("typing.stop", JSONObject().put("recipient_id", recipientId))

    fun presenceUpdate(online: Boolean): Boolean =
        send("presence.update", JSONObject().put("online", online))

    // -- internals --------------------------------------------------------------

    private fun send(type: String, payload: JSONObject): Boolean {
        val frame = JSONObject().apply {
            put("type", type)
            put("payload", payload)
        }
        return webSocket?.send(frame.toString()) ?: false
    }

    private fun openSocket() {
        val token = currentToken ?: return
        // Abandon any previous socket: drop our reference FIRST so its late
        // terminal callbacks are recognized as stale (see the identity check in
        // socketListener) and can't clobber the new socket's state or trigger a
        // churn loop, then close it.
        val previous = webSocket
        webSocket = null
        previous?.close(CLOSE_NORMAL, null)
        _connectionState.value = ConnectionState.CONNECTING
        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()
        webSocket = client.newWebSocket(request, socketListener)
    }

    // The listener is shared across sockets. Every callback first checks it came
    // from the CURRENT socket — an abandoned socket's late onClosed/onFailure
    // must not flip state or schedule a reconnect (that would flap forever).
    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            if (webSocket !== this@WsClient.webSocket) return
            reconnectAttempts = 0
            _connectionState.value = ConnectionState.CONNECTED
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (webSocket !== this@WsClient.webSocket) return
            // Frames carry only ciphertext envelopes and routing metadata.
            // They are parsed and dispatched — NEVER logged.
            val frame = runCatching { JSONObject(text) }.getOrNull() ?: return
            val type = frame.optString("type")
            val payload = frame.optJSONObject("payload") ?: JSONObject()
            dispatch(type, payload)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (webSocket !== this@WsClient.webSocket) return
            _connectionState.value = ConnectionState.DISCONNECTED
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (webSocket !== this@WsClient.webSocket) return
            _connectionState.value = ConnectionState.DISCONNECTED
            // Deliberate teardown (disconnect/logout/delete) must never re-enter
            // reconnect or re-auth.
            if (intentionallyClosed) return
            // A rejected token (JWTs live 15 min) would make every socket-level
            // retry a fresh 401 forever. Hand back to the coordinator to
            // re-authenticate instead of scheduling a doomed reconnect.
            if (response?.code == 401 || response?.code == 403) {
                intentionallyClosed = true
                listener?.onAuthExpired()
            } else {
                scheduleReconnect()
            }
        }
    }

    private fun dispatch(type: String, payload: JSONObject) {
        val l = listener ?: return
        when (type) {
            "message.deliver" -> {
                payload.optJSONObject("envelope")?.let { envelopeJson ->
                    runCatching { MessageEnvelope.fromJson(envelopeJson) }
                        .getOrNull()
                        ?.let(l::onMessageDeliver)
                }
            }
            "message.burned" -> l.onMessageBurned(payload.optString("message_id"))
            "typing.start" -> l.onTyping(payload.optString("sender_id"), started = true)
            "typing.stop" -> l.onTyping(payload.optString("sender_id"), started = false)
            "presence.update" -> l.onPresence(
                payload.optString("user_id"),
                payload.optBoolean("online", false),
            )
            "prekey.low" -> l.onPreKeyLow(payload.optInt("remaining", 0))
            "session.revoked" -> {
                intentionallyClosed = true
                l.onSessionRevoked()
            }
            "error" -> l.onServerError(
                payload.optString("code", "unknown"),
                payload.optString("message", ""),
            )
        }
    }

    private fun scheduleReconnect() {
        if (intentionallyClosed) return
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            val backoffMs = min(MAX_BACKOFF_MS, BASE_BACKOFF_MS shl min(reconnectAttempts, 5))
            reconnectAttempts += 1
            delay(backoffMs)
            if (!intentionallyClosed) openSocket()
        }
    }

    companion object {
        private const val CLOSE_NORMAL = 1000
        private const val BASE_BACKOFF_MS = 1_000L
        private const val MAX_BACKOFF_MS = 60_000L
    }
}
