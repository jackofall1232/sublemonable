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
 * WIRE CONTRACT — must stay byte-compatible with the server
 * (server/internal/ws/hub.go) and packages/protocol/src/events.ts. Frames are
 * FLAT: every field sits next to "type" at the top level — there is NO
 * "payload" wrapper. (v1.5.3 shipped a nested {type, payload} shape the server
 * has never spoken; see .l00prite/ledger.md.)
 *
 *  client -> server: {"type":"message.send","envelope":{...}}
 *                    {"type":"message.ack","message_id":...}
 *                    {"type":"message.burn","message_id":...,"peer_id":...}
 *                    {"type":"typing.start"/"typing.stop","peer_id":...}
 *                    {"type":"presence.update","online":...}
 *  server -> client: {"type":"message.deliver","envelope":{...}}
 *                    {"type":"message.burned","message_id":...,"peer_id":...}
 *                    {"type":"prekey.low","remaining":...}
 *                    {"type":"session.revoked"} / {"type":"error","code":...}
 *
 * Handshake auth: the JWT rides the Sec-WebSocket-Protocol request header —
 * the only header the server's /ws middleware reads (an Authorization header
 * is ignored there; the ?token= query param is the documented fallback but
 * would put the token in URLs, which proxies love to log). OkHttp passes the
 * header through verbatim and does not require the server to echo it.
 *
 * Acking a delivery is what triggers the server to DELETE the stored
 * envelope (store-and-forward only) — see [ackMessage].
 *
 * Socket-lifecycle diagnostics go through [diag] — the same privacy-safe
 * channel as the boot-stage logging in MessagingCoordinator (fixed stage
 * strings + exception class/message + HTTP status only; never tokens, frame
 * contents, account ids, or URLs). Without it, a rejected or unreachable
 * handshake is invisible: the socket retries forever and the UI just says
 * "Connecting…" (exactly how v1.5.3 failed).
 */
class WsClient(
    private val wsUrl: String,
    private var client: OkHttpClient,
    private val scope: CoroutineScope,
    private val diag: (String) -> Unit = {},
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

    /** message.send — the envelope itself carries the recipient for routing. */
    fun sendMessage(envelope: MessageEnvelope): Boolean =
        send(messageSendFrame(envelope))

    /**
     * message.ack — delivery confirmation. CRITICAL: the server deletes the
     * stored envelope immediately upon receiving this (zero retention).
     */
    fun ackMessage(messageId: String): Boolean =
        send(messageAckFrame(messageId))

    /**
     * message.burn — request early destruction of a message everywhere.
     * [peerId] routes the burn notification to the other side.
     */
    fun burnMessage(messageId: String, peerId: String): Boolean =
        send(messageBurnFrame(messageId, peerId))

    fun typingStart(peerId: String): Boolean = send(typingFrame(started = true, peerId = peerId))

    fun typingStop(peerId: String): Boolean = send(typingFrame(started = false, peerId = peerId))

    fun presenceUpdate(online: Boolean): Boolean = send(presenceFrame(online))

    // -- internals --------------------------------------------------------------

    private fun send(frame: JSONObject): Boolean =
        webSocket?.send(frame.toString()) ?: false

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
        diag("ws[$reconnectAttempts]: firing WS /ws handshake")
        val request = Request.Builder()
            .url(wsUrl)
            // The server's /ws middleware authenticates from THIS header (or a
            // ?token= query param) — NOT Authorization, which it never reads.
            .header("Sec-WebSocket-Protocol", token)
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
            diag("ws: connected")
            _connectionState.value = ConnectionState.CONNECTED
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (webSocket !== this@WsClient.webSocket) return
            dispatchFrame(text)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (webSocket !== this@WsClient.webSocket) return
            // Close code only — a close reason is server/proxy-controlled text.
            diag("ws: closed code=$code")
            _connectionState.value = ConnectionState.DISCONNECTED
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (webSocket !== this@WsClient.webSocket) return
            _connectionState.value = ConnectionState.DISCONNECTED
            // Deliberate teardown (disconnect/logout/delete) must never re-enter
            // reconnect or re-auth — and an expected teardown isn't a failure
            // worth a diagnostic line.
            if (intentionallyClosed) return
            // Exception class + message + HTTP status only (same discrimination
            // logic as the boot loop: pin failure vs TLS vs unreachable vs a
            // handshake the server rejected) — never the token, URL, or body.
            val status = response?.code?.let { " http_status=$it" }.orEmpty()
            diag("ws: handshake/stream failed: ${t.javaClass.name}: ${t.message}$status")
            // A rejected token (JWTs live 15 min) would make every socket-level
            // retry a fresh 401 forever. Hand back to the coordinator to
            // re-authenticate instead of scheduling a doomed reconnect.
            if (response?.code == 401 || response?.code == 403) {
                diag("ws: token rejected — handing off to re-auth")
                intentionallyClosed = true
                listener?.onAuthExpired()
            } else {
                scheduleReconnect()
            }
        }
    }

    /**
     * Parse one server frame and dispatch to [listener]. Fields sit flat next
     * to "type" (see class kdoc). Frames carry only ciphertext envelopes and
     * routing metadata; they are parsed and dispatched — NEVER logged.
     * Internal (not private) so the frame contract is unit-testable.
     */
    internal fun dispatchFrame(text: String) {
        val frame = runCatching { JSONObject(text) }.getOrNull() ?: return
        val l = listener ?: return
        when (frame.optString("type")) {
            "message.deliver" -> {
                frame.optJSONObject("envelope")?.let { envelopeJson ->
                    runCatching { MessageEnvelope.fromJson(envelopeJson) }
                        .getOrNull()
                        ?.let(l::onMessageDeliver)
                }
            }
            "message.burned" -> l.onMessageBurned(frame.optString("message_id"))
            "typing.start" -> l.onTyping(frame.optString("peer_id"), started = true)
            "typing.stop" -> l.onTyping(frame.optString("peer_id"), started = false)
            "presence.update" -> l.onPresence(
                frame.optString("peer_id"),
                frame.optBoolean("online", false),
            )
            "prekey.low" -> l.onPreKeyLow(frame.optInt("remaining", 0))
            "session.revoked" -> {
                intentionallyClosed = true
                l.onSessionRevoked()
            }
            "error" -> l.onServerError(frame.optString("code", "unknown"), "")
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

        // Outbound frame builders — pure functions, extracted so the wire shape
        // (flat fields, exact snake_case names — see class kdoc) is
        // unit-testable against the server contract without a socket.

        internal fun messageSendFrame(envelope: MessageEnvelope): JSONObject =
            JSONObject().put("type", "message.send").put("envelope", envelope.toJson())

        internal fun messageAckFrame(messageId: String): JSONObject =
            JSONObject().put("type", "message.ack").put("message_id", messageId)

        internal fun messageBurnFrame(messageId: String, peerId: String): JSONObject =
            JSONObject().put("type", "message.burn")
                .put("message_id", messageId)
                .put("peer_id", peerId)

        internal fun typingFrame(started: Boolean, peerId: String): JSONObject =
            JSONObject().put("type", if (started) "typing.start" else "typing.stop")
                .put("peer_id", peerId)

        internal fun presenceFrame(online: Boolean): JSONObject =
            JSONObject().put("type", "presence.update").put("online", online)
    }
}
