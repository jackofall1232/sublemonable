// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

import org.json.JSONObject

/**
 * Wire format for an encrypted message. This MUST stay byte-compatible with
 * packages/protocol (message_envelope_schema) — snake_case field names,
 * version "1". The server only ever sees this envelope: the ciphertext is
 * opaque and every plaintext-adjacent field is protocol metadata only.
 */
data class MessageEnvelope(
    /** UUID v4. */
    val id: String,
    /** Sender account UUID. */
    val senderId: String,
    /** Recipient account UUID. */
    val recipientId: String,
    /** Base64 serialized Signal ciphertext message. */
    val ciphertext: String,
    /** Base64 Curve25519 public key — X3DH first message only, null after. */
    val ephemeralKey: String?,
    /** One-time prekey id consumed by X3DH, null after session established. */
    val preKeyId: Int?,
    /** Double Ratchet counter. */
    val messageNumber: Int,
    /** Length of the previous sending chain. */
    val previousChainLength: Int,
    /** ISO 8601 UTC. */
    val timestamp: String,
    /** Self-destruct TTL in seconds; null means no self-destruct. */
    val ttlSeconds: Int?,
    /** Destroy on all devices immediately after first open. */
    val burnOnRead: Boolean,
    /** "text" | "image" | "file". */
    val mediaType: String,
    /** Protocol version — always "1". */
    val version: String = PROTOCOL_VERSION,
) {

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("sender_id", senderId)
        put("recipient_id", recipientId)
        put("ciphertext", ciphertext)
        put("ephemeral_key", ephemeralKey ?: JSONObject.NULL)
        put("prekey_id", preKeyId ?: JSONObject.NULL)
        put("message_number", messageNumber)
        put("previous_chain_length", previousChainLength)
        put("timestamp", timestamp)
        put("ttl_seconds", ttlSeconds ?: JSONObject.NULL)
        put("burn_on_read", burnOnRead)
        put("media_type", mediaType)
        put("version", version)
    }

    fun toJsonString(): String = toJson().toString()

    companion object {
        const val PROTOCOL_VERSION = "1"

        const val MEDIA_TEXT = "text"
        const val MEDIA_IMAGE = "image"
        const val MEDIA_FILE = "file"

        fun fromJson(json: JSONObject): MessageEnvelope = MessageEnvelope(
            id = json.getString("id"),
            senderId = json.getString("sender_id"),
            recipientId = json.getString("recipient_id"),
            ciphertext = json.getString("ciphertext"),
            ephemeralKey = if (json.isNull("ephemeral_key")) null else json.getString("ephemeral_key"),
            preKeyId = if (json.isNull("prekey_id")) null else json.getInt("prekey_id"),
            messageNumber = json.getInt("message_number"),
            previousChainLength = json.getInt("previous_chain_length"),
            timestamp = json.getString("timestamp"),
            ttlSeconds = if (json.isNull("ttl_seconds")) null else json.getInt("ttl_seconds"),
            burnOnRead = json.getBoolean("burn_on_read"),
            mediaType = json.getString("media_type"),
            version = json.getString("version"),
        )

        fun fromJsonString(raw: String): MessageEnvelope = fromJson(JSONObject(raw))
    }
}
