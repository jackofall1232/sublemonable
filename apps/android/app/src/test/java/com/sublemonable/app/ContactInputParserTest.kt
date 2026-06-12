// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.ui.components.parseContactInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ContactInputParserTest {

    private val uuid = "0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a"

    @Test
    fun `accepts a raw uuid`() {
        assertEquals(uuid, parseContactInput(uuid))
        assertEquals(uuid, parseContactInput("  $uuid  "))
    }

    @Test
    fun `normalizes uppercase uuids`() {
        assertEquals(uuid, parseContactInput(uuid.uppercase()))
    }

    @Test
    fun `parses the cross-client QR exchange payload`() {
        val payload =
            """{"version":"1","account_id":"$uuid","identity_key":"qq42BASE64=="}"""
        assertEquals(uuid, parseContactInput(payload))
    }

    @Test
    fun `extracts the uuid from an invite link`() {
        assertEquals(uuid, parseContactInput("https://sublemonable.example/add/$uuid"))
    }

    @Test
    fun `falls back to uuid search on malformed json`() {
        assertEquals(uuid, parseContactInput("{not json $uuid"))
    }

    @Test
    fun `rejects input without a uuid`() {
        assertNull(parseContactInput("not a contact id"))
        assertNull(parseContactInput("""{"version":"1","account_id":"nope"}"""))
        assertNull(parseContactInput(""))
    }
}
