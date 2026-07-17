// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Control payloads (currently: read receipts) ride INSIDE the encrypted
 * plaintext of an ordinary message envelope — media_type "text", no TTL, no
 * burn flag — deliberately indistinguishable from a real message on the wire.
 * That is what makes the Settings copy true: "Encrypted signal — the server
 * never knows read status". A dedicated plaintext frame type (the way
 * message.burn works) would tell the relay exactly when messages are read;
 * riding message.send instead also gives receipts the same store-and-forward
 * guarantee as messages, so a sender who is offline when their message is
 * read still gets the receipt on reconnect.
 *
 * Wire shape (canonical cross-client definition:
 * packages/protocol/src/receipts.ts):
 *
 *   {"v":1,"control":"receipt.read","message_ids":["<uuid>", ...]}
 *
 * Parsing is strict on the discriminator (both "v" and "control" must match)
 * and lenient on extra fields, so future revisions can extend the payload
 * without old clients mistaking receipts for conversation text. The corner
 * case of a user typing this exact JSON as a message is accepted: it would
 * arrive, parse as a receipt for ids that don't exist, and be dropped.
 */
object ControlPayload {

    private const val VERSION = 1
    private const val KIND_READ_RECEIPT = "receipt.read"

    /** Serializes a read receipt for the given envelope ids. */
    fun readReceipt(messageIds: List<String>): String =
        JSONObject()
            .put("v", VERSION)
            .put("control", KIND_READ_RECEIPT)
            .put("message_ids", JSONArray(messageIds))
            .toString()

    /**
     * Returns the read message ids when [plaintext] is a read-receipt control
     * payload, or null when it is a regular message to display.
     */
    fun parseReadReceipt(plaintext: String): List<String>? {
        if (!plaintext.startsWith("{")) return null
        val json = runCatching { JSONObject(plaintext) }.getOrNull() ?: return null
        if (json.optInt("v") != VERSION) return null
        if (json.optString("control") != KIND_READ_RECEIPT) return null
        val ids = json.optJSONArray("message_ids") ?: return null
        return buildList {
            for (i in 0 until ids.length()) {
                // opt + cast, NOT optString: optString would coerce numbers
                // and booleans into strings instead of dropping them.
                val id = ids.opt(i) as? String ?: continue
                if (id.isNotEmpty()) add(id)
            }
        }
    }
}
