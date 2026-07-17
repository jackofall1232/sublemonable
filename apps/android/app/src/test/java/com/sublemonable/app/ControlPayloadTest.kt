// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.data.ControlPayload
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Wire-format contract for read-receipt control payloads — must stay
 * byte-compatible with packages/protocol/src/receipts.ts.
 */
class ControlPayloadTest {

    private val ids = listOf(
        "0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a",
        "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d",
    )

    @Test
    fun `read receipts round-trip through serialization`() {
        assertEquals(ids, ControlPayload.parseReadReceipt(ControlPayload.readReceipt(ids)))
    }

    @Test
    fun `serialized shape matches the cross-client contract`() {
        val json = JSONObject(ControlPayload.readReceipt(ids))
        assertEquals(1, json.getInt("v"))
        assertEquals("receipt.read", json.getString("control"))
        assertEquals(2, json.getJSONArray("message_ids").length())
    }

    @Test
    fun `ordinary message text is never a receipt`() {
        assertNull(ControlPayload.parseReadReceipt("hey, did you get my message?"))
        assertNull(ControlPayload.parseReadReceipt(""))
        assertNull(ControlPayload.parseReadReceipt("{not json at all"))
    }

    @Test
    fun `json without the exact discriminator is conversation text`() {
        assertNull(ControlPayload.parseReadReceipt("""{"hello":"world"}"""))
        assertNull(
            ControlPayload.parseReadReceipt(
                """{"v":2,"control":"receipt.read","message_ids":[]}""",
            ),
        )
        assertNull(
            ControlPayload.parseReadReceipt(
                """{"v":1,"control":"receipt.unknown","message_ids":[]}""",
            ),
        )
        assertNull(ControlPayload.parseReadReceipt("""{"v":1,"control":"receipt.read"}"""))
    }

    @Test
    fun `extra fields are tolerated and non-string ids filtered`() {
        val raw = """
            {"v":1,"control":"receipt.read","message_ids":["${ids[0]}","",42,"${ids[1]}"],"future":true}
        """.trimIndent()
        assertEquals(ids, ControlPayload.parseReadReceipt(raw))
    }
}
