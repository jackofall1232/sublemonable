// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.crypto.MessagePadding
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Byte-compatibility contract with packages/crypto/src/padding.ts: 4-byte
 * big-endian length prefix + plaintext + random fill, 256-byte blocks.
 */
class MessagePaddingTest {

    @Test
    fun `round-trips plaintexts across block boundaries`() {
        // 252 fills a block exactly (4 + 252 = 256); 253 spills into a second.
        for (size in intArrayOf(0, 1, 3, 251, 252, 253, 256, 1000)) {
            val plaintext = ByteArray(size) { (it % 251).toByte() }
            val padded = MessagePadding.pad(plaintext)
            assertEquals(0, padded.size % MessagePadding.BLOCK_BYTES)
            assertTrue(padded.size >= MessagePadding.BLOCK_BYTES)
            assertArrayEquals(plaintext, MessagePadding.unpadOrNull(padded))
        }
    }

    @Test
    fun `length prefix is big-endian, matching the web scheme`() {
        val padded = MessagePadding.pad(ByteArray(300))
        assertEquals(0, padded[0].toInt())
        assertEquals(0, padded[1].toInt())
        assertEquals(1, padded[2].toInt())          // 300 = 0x012C
        assertEquals(0x2C, padded[3].toInt() and 0xFF)
        assertEquals(512, padded.size)              // 4 + 300 -> two blocks
    }

    @Test
    fun `equal-length buckets hide short message and receipt sizes`() {
        val shortText = MessagePadding.pad("ok".toByteArray(Charsets.UTF_8))
        val receipt = MessagePadding.pad(
            """{"v":1,"control":"receipt.read","message_ids":["0b9f8c1e-4f2a-4d8b-9c3e-7a6b5d4c3b2a"]}"""
                .toByteArray(Charsets.UTF_8),
        )
        assertEquals(shortText.size, receipt.size)
    }

    @Test
    fun `legacy unpadded text is recognized as not padded`() {
        // UTF-8 text never begins with a NUL byte, so its first 4 bytes decode
        // to a length far larger than the buffer — unpad must reject, letting
        // callers fall back to the raw bytes.
        assertNull(MessagePadding.unpadOrNull("hey, did you get my message?".toByteArray(Charsets.UTF_8)))
        assertNull(MessagePadding.unpadOrNull("""{"v":1}""".toByteArray(Charsets.UTF_8)))
        assertNull(MessagePadding.unpadOrNull(ByteArray(3)))
    }
}
