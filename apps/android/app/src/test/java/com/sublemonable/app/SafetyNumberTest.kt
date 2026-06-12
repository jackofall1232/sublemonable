// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.crypto.SafetyNumber
import com.sublemonable.app.net.ApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SafetyNumberTest {

    private val keyA = ByteArray(33) { (it + 1).toByte() }
    private val keyB = ByteArray(33) { (200 - it).toByte() }

    @Test
    fun `both parties derive the identical safety number`() {
        assertEquals(SafetyNumber.compute(keyA, keyB), SafetyNumber.compute(keyB, keyA))
    }

    @Test
    fun `different key pairs produce different numbers`() {
        val keyC = ByteArray(33) { (it * 3 + 7).toByte() }
        assertNotEquals(SafetyNumber.compute(keyA, keyB), SafetyNumber.compute(keyA, keyC))
    }

    @Test
    fun `fingerprint renders as groups of four hex chars`() {
        val fingerprint = SafetyNumber.compute(keyA, keyB)
        val groups = fingerprint.split(" ")
        assertEquals(16, groups.size) // 32 bytes -> 64 hex chars -> 16 groups
        groups.forEach { group ->
            assertTrue("group '$group' malformed", group.matches(Regex("[0-9A-F]{4}")))
        }
    }

    @Test
    fun `formatting splits bytes deterministically`() {
        val formatted = SafetyNumber.formatFingerprint(byteArrayOf(0x0A, 0x1B, 0x2C, 0x3D))
        assertEquals("0A1B 2C3D", formatted)
    }

    @Test
    fun `login challenge format matches the server contract`() {
        assertEquals(
            "sublemonable-login:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d:1760000000",
            ApiClient.loginChallenge("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", 1_760_000_000L),
        )
    }
}
