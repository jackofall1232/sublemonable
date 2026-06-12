// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.data.MessageEnvelope
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The envelope must stay byte-compatible with packages/protocol
 * (message_envelope_schema): exact snake_case keys, version "1".
 */
class MessageEnvelopeTest {

    private fun sampleEnvelope() = MessageEnvelope(
        id = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        senderId = "11111111-1111-4111-8111-111111111111",
        recipientId = "22222222-2222-4222-8222-222222222222",
        ciphertext = "Y2lwaGVydGV4dA==",
        ephemeralKey = "BWVwaGVtZXJhbA==",
        preKeyId = 42,
        messageNumber = 7,
        previousChainLength = 3,
        timestamp = "2026-06-12T10:15:30Z",
        ttlSeconds = 300,
        burnOnRead = true,
        mediaType = MessageEnvelope.MEDIA_TEXT,
    )

    @Test
    fun `serializes with exact snake_case field names`() {
        val json = sampleEnvelope().toJson()
        val expectedKeys = setOf(
            "id", "sender_id", "recipient_id", "ciphertext", "ephemeral_key",
            "prekey_id", "message_number", "previous_chain_length", "timestamp",
            "ttl_seconds", "burn_on_read", "media_type", "version",
        )
        val actualKeys = json.keys().asSequence().toSet()
        assertEquals(expectedKeys, actualKeys)
        assertEquals("1", json.getString("version"))
        assertEquals("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", json.getString("id"))
        assertEquals(42, json.getInt("prekey_id"))
        assertEquals(7, json.getInt("message_number"))
        assertEquals(3, json.getInt("previous_chain_length"))
        assertEquals(300, json.getInt("ttl_seconds"))
        assertTrue(json.getBoolean("burn_on_read"))
        assertEquals("text", json.getString("media_type"))
    }

    @Test
    fun `round trips losslessly`() {
        val original = sampleEnvelope()
        val restored = MessageEnvelope.fromJsonString(original.toJsonString())
        assertEquals(original, restored)
    }

    @Test
    fun `nullable fields serialize as json null and parse back`() {
        val envelope = sampleEnvelope().copy(
            ephemeralKey = null,
            preKeyId = null,
            ttlSeconds = null,
        )
        val json = envelope.toJson()
        assertTrue(json.has("ephemeral_key"))
        assertTrue(json.isNull("ephemeral_key"))
        assertTrue(json.has("prekey_id"))
        assertTrue(json.isNull("prekey_id"))
        assertTrue(json.has("ttl_seconds"))
        assertTrue(json.isNull("ttl_seconds"))

        val restored = MessageEnvelope.fromJsonString(envelope.toJsonString())
        assertNull(restored.ephemeralKey)
        assertNull(restored.preKeyId)
        assertNull(restored.ttlSeconds)
        assertEquals(envelope, restored)
    }

    @Test
    fun `parses an envelope produced by another client`() {
        val wire = JSONObject(
            """
            {
              "id": "3c9f8a7e-1d2b-4c5a-9e8f-7a6b5c4d3e2f",
              "sender_id": "33333333-3333-4333-8333-333333333333",
              "recipient_id": "44444444-4444-4444-8444-444444444444",
              "ciphertext": "AAEC",
              "ephemeral_key": null,
              "prekey_id": null,
              "message_number": 12,
              "previous_chain_length": 0,
              "timestamp": "2026-06-12T08:00:00Z",
              "ttl_seconds": 30,
              "burn_on_read": false,
              "media_type": "image",
              "version": "1"
            }
            """.trimIndent(),
        )
        val envelope = MessageEnvelope.fromJson(wire)
        assertEquals(12, envelope.messageNumber)
        assertNull(envelope.ephemeralKey)
        assertEquals(30, envelope.ttlSeconds)
        assertEquals("image", envelope.mediaType)
        assertEquals("1", envelope.version)
    }
}
