// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.crypto

import java.security.SecureRandom

/**
 * Length-hiding plaintext padding, byte-compatible with the web client's
 * scheme (packages/crypto/src/padding.ts): a 4-byte big-endian length prefix,
 * the plaintext, then random fill up to a multiple of [BLOCK_BYTES].
 *
 * Every plaintext that enters the Double Ratchet — conversation text AND
 * control payloads like read receipts — is padded first, so ciphertext
 * length buckets to 256/512/… and the relay cannot fingerprint a receipt
 * (or a short reply) by its size. Without this, receipt ciphertexts had a
 * near-constant, predictable length and the "server never knows read
 * status" guarantee leaked through traffic analysis.
 *
 * Receive-side compatibility: [unpadOrNull] returns null for input that is
 * not a valid padded block, and callers fall back to treating the bytes as
 * legacy unpadded text (pre-padding clients). The reverse aliasing —
 * legacy text that parses as valid padding — would need the text to begin
 * with a NUL byte, which UTF-8 conversation text never does.
 */
object MessagePadding {

    const val BLOCK_BYTES = 256
    private const val LEN_PREFIX_BYTES = 4

    private val random = SecureRandom()

    /** Pads [plaintext] to the next [BLOCK_BYTES] boundary (minimum one block). */
    fun pad(plaintext: ByteArray): ByteArray {
        val bodyLen = LEN_PREFIX_BYTES + plaintext.size
        val totalLen = maxOf(((bodyLen + BLOCK_BYTES - 1) / BLOCK_BYTES) * BLOCK_BYTES, BLOCK_BYTES)
        val out = ByteArray(totalLen)
        out[0] = (plaintext.size ushr 24).toByte()
        out[1] = (plaintext.size ushr 16).toByte()
        out[2] = (plaintext.size ushr 8).toByte()
        out[3] = plaintext.size.toByte()
        plaintext.copyInto(out, LEN_PREFIX_BYTES)
        if (totalLen > bodyLen) {
            val fill = ByteArray(totalLen - bodyLen)
            random.nextBytes(fill)
            fill.copyInto(out, bodyLen)
        }
        return out
    }

    /**
     * Recovers the original plaintext, or null when [padded] is not a valid
     * padded block (legacy unpadded sender — caller uses the bytes as-is).
     */
    fun unpadOrNull(padded: ByteArray): ByteArray? {
        if (padded.size < LEN_PREFIX_BYTES) return null
        val length = ((padded[0].toInt() and 0xFF) shl 24) or
            ((padded[1].toInt() and 0xFF) shl 16) or
            ((padded[2].toInt() and 0xFF) shl 8) or
            (padded[3].toInt() and 0xFF)
        if (length < 0 || length > padded.size - LEN_PREFIX_BYTES) return null
        return padded.copyOfRange(LEN_PREFIX_BYTES, LEN_PREFIX_BYTES + length)
    }
}
