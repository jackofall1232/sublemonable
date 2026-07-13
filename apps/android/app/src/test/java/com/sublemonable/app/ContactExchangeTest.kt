// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.ui.components.buildContactExchangePayload
import com.sublemonable.app.ui.components.parseContactInput
import com.sublemonable.app.ui.components.parseContactPayload
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ContactExchangeTest {

    private val uuid = "0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a"
    private val identityKey = "qq42BASE64identitykeybytes=="

    @Test
    fun `payload carries version, account id and identity key`() {
        val json = JSONObject(buildContactExchangePayload(uuid, identityKey))
        // Version is the STRING "1", matching iOS ContactExchangePayload.
        assertEquals("1", json.getString("version"))
        assertEquals(uuid, json.getString("account_id"))
        assertEquals(identityKey, json.getString("identity_key"))
    }

    @Test
    fun `account id is lowercased like the other clients`() {
        val json = JSONObject(buildContactExchangePayload(uuid.uppercase(), identityKey))
        assertEquals(uuid, json.getString("account_id"))
    }

    @Test
    fun `payload round-trips back through the shared parser`() {
        // What our QR encodes, every client's parser (and ours) must decode to
        // the same account id — this is the contract with iOS/web.
        val payload = buildContactExchangePayload(uuid, identityKey)
        assertEquals(uuid, parseContactInput(payload))
    }

    @Test
    fun `full payload carries the identity key to pin`() {
        val payload = buildContactExchangePayload(uuid, identityKey)
        val parsed = parseContactPayload(payload)!!
        assertEquals(uuid, parsed.accountId)
        assertEquals(identityKey, parsed.identityKeyBase64)
    }

    @Test
    fun `bare uuid and link have no key to pin`() {
        assertEquals(uuid, parseContactPayload(uuid)!!.accountId)
        assertNull(parseContactPayload(uuid)!!.identityKeyBase64)
        val fromLink = parseContactPayload("https://sublemonable.example/add/$uuid")!!
        assertEquals(uuid, fromLink.accountId)
        assertNull(fromLink.identityKeyBase64)
    }

    @Test
    fun `payload without an identity key yields a null pin`() {
        val parsed = parseContactPayload("""{"version":"1","account_id":"$uuid"}""")!!
        assertEquals(uuid, parsed.accountId)
        assertNull(parsed.identityKeyBase64)
    }
}
