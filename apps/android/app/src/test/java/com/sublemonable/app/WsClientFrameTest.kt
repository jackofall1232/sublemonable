// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.data.MessageEnvelope
import com.sublemonable.app.net.WsClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import okhttp3.OkHttpClient
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The WebSocket frame shape must stay byte-compatible with the server
 * (server/internal/ws/hub.go clientEvent/serverEvent) and
 * packages/protocol/src/events.ts: FLAT frames — every field a sibling of
 * "type", never wrapped in a "payload" object.
 *
 * v1.5.3 shipped a nested {type, payload:{…}} shape the server has never
 * spoken; the server answered every send with {"error":"bad_envelope"} and
 * dropped every delivery on the floor client-side. These tests pin the
 * contract so it cannot regress silently again.
 */
class WsClientFrameTest {

    private fun sampleEnvelope() = MessageEnvelope(
        id = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        senderId = "11111111-1111-4111-8111-111111111111",
        recipientId = "22222222-2222-4222-8222-222222222222",
        ciphertext = "Y2lwaGVydGV4dA==",
        ephemeralKey = null,
        preKeyId = null,
        messageNumber = 0,
        previousChainLength = 0,
        timestamp = "2026-07-16T10:15:30Z",
        ttlSeconds = null,
        burnOnRead = false,
        mediaType = MessageEnvelope.MEDIA_TEXT,
    )

    // ── outbound (client → server) ────────────────────────────────────────────

    @Test
    fun `message send frame is flat with envelope at top level`() {
        val frame = WsClient.messageSendFrame(sampleEnvelope())
        assertEquals("message.send", frame.getString("type"))
        assertTrue(frame.has("envelope"))
        assertFalse("payload wrapper must not exist", frame.has("payload"))
        // The server routes by the envelope header fields.
        val envelope = frame.getJSONObject("envelope")
        assertEquals("22222222-2222-4222-8222-222222222222", envelope.getString("recipient_id"))
        assertEquals("11111111-1111-4111-8111-111111111111", envelope.getString("sender_id"))
    }

    @Test
    fun `ack frame carries message_id at top level`() {
        val frame = WsClient.messageAckFrame("msg-1")
        assertEquals("message.ack", frame.getString("type"))
        assertEquals("msg-1", frame.getString("message_id"))
        assertFalse(frame.has("payload"))
    }

    @Test
    fun `burn frame carries message_id and peer_id at top level`() {
        val frame = WsClient.messageBurnFrame("msg-1", "peer-1")
        assertEquals("message.burn", frame.getString("type"))
        assertEquals("msg-1", frame.getString("message_id"))
        assertEquals("peer-1", frame.getString("peer_id"))
        assertFalse(frame.has("payload"))
    }

    @Test
    fun `typing frames use peer_id, not recipient_id`() {
        val start = WsClient.typingFrame(started = true, peerId = "peer-1")
        val stop = WsClient.typingFrame(started = false, peerId = "peer-1")
        assertEquals("typing.start", start.getString("type"))
        assertEquals("typing.stop", stop.getString("type"))
        assertEquals("peer-1", start.getString("peer_id"))
        assertFalse(start.has("recipient_id"))
        assertFalse(start.has("payload"))
    }

    // presence.update is deliberately not implemented (no frame builder, no
    // dispatch): the canonical event is an encrypted signal Android does not
    // yet produce, and the server drops every presence frame today (its
    // relay routes by a peer_id the presence event does not define).

    // ── inbound (server → client) ─────────────────────────────────────────────

    private class RecordingListener : WsClient.Listener {
        var delivered: MessageEnvelope? = null
        var burnedId: String? = null
        var typing: Pair<String, Boolean>? = null
        var preKeyRemaining: Int? = null
        var revoked = false
        var errorCode: String? = null

        override fun onMessageDeliver(envelope: MessageEnvelope) { delivered = envelope }
        override fun onMessageBurned(messageId: String) { burnedId = messageId }
        override fun onTyping(senderId: String, started: Boolean) { typing = senderId to started }
        override fun onPreKeyLow(remaining: Int) { preKeyRemaining = remaining }
        override fun onSessionRevoked() { revoked = true }
        override fun onAuthExpired() {}
        override fun onServerError(code: String, message: String) { errorCode = code }
    }

    private fun clientWith(listener: WsClient.Listener): WsClient =
        WsClient(
            wsUrl = "wss://example.invalid/ws",
            client = OkHttpClient(),
            scope = CoroutineScope(Dispatchers.Unconfined),
        ).also { it.listener = listener }

    @Test
    fun `deliver frame with flat envelope reaches the listener`() {
        val listener = RecordingListener()
        val frame = JSONObject()
            .put("type", "message.deliver")
            .put("envelope", sampleEnvelope().toJson())
        clientWith(listener).dispatchFrame(frame.toString())
        assertEquals("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", listener.delivered?.id)
    }

    @Test
    fun `flat burned, typing, prekey, revoked and error frames dispatch`() {
        val listener = RecordingListener()
        val ws = clientWith(listener)
        ws.dispatchFrame("""{"type":"message.burned","message_id":"m1","peer_id":"p1"}""")
        ws.dispatchFrame("""{"type":"typing.start","peer_id":"p1"}""")
        ws.dispatchFrame("""{"type":"prekey.low","remaining":7}""")
        ws.dispatchFrame("""{"type":"error","code":"bad_envelope"}""")
        ws.dispatchFrame("""{"type":"session.revoked"}""")
        assertEquals("m1", listener.burnedId)
        assertEquals("p1" to true, listener.typing)
        assertEquals(7, listener.preKeyRemaining)
        assertEquals("bad_envelope", listener.errorCode)
        assertTrue(listener.revoked)
    }

    @Test
    fun `malformed and unknown frames are dropped without dispatch`() {
        val listener = RecordingListener()
        val ws = clientWith(listener)
        ws.dispatchFrame("not json")
        ws.dispatchFrame("""{"type":"unknown.event","message_id":"m1"}""")
        // The old nested shape must no longer be understood either — dropped
        // entirely, never dispatched with an empty id.
        ws.dispatchFrame("""{"type":"message.burned","payload":{"message_id":"m1"}}""")
        ws.dispatchFrame("""{"type":"typing.start","payload":{"recipient_id":"p1"}}""")
        ws.dispatchFrame("""{"type":"prekey.low"}""")
        assertNull(listener.delivered)
        assertNull(listener.burnedId)
        assertNull(listener.typing)
        assertNull(listener.preKeyRemaining)
    }
}
