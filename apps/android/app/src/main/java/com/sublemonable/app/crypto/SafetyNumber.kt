// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.crypto

import java.security.MessageDigest

/**
 * Safety Number computation for contact verification
 * (features.contact_verification): a SHA-512 fingerprint over BOTH identity
 * keys, ordered canonically so both parties derive the identical number.
 *
 * Pure JVM logic — unit-testable without Android.
 */
object SafetyNumber {

    /** Number of fingerprint bytes rendered (64 hex chars -> 16 groups of 4). */
    private const val DISPLAY_BYTES = 32

    /**
     * Computes the shared safety number for two serialized public identity
     * keys. Key order is canonicalized (lexicographic byte order) so
     * `compute(a, b) == compute(b, a)`.
     *
     * @return uppercase hex, grouped in 4s separated by single spaces —
     *         the key_fingerprint display format. Render in JetBrains Mono.
     */
    fun compute(identityKeyA: ByteArray, identityKeyB: ByteArray): String {
        val (first, second) = if (lexicographicCompare(identityKeyA, identityKeyB) <= 0) {
            identityKeyA to identityKeyB
        } else {
            identityKeyB to identityKeyA
        }
        val digest = MessageDigest.getInstance("SHA-512").apply {
            update(first)
            update(second)
        }.digest()
        return formatFingerprint(digest.copyOf(DISPLAY_BYTES))
    }

    /** SHA-512 fingerprint of a single identity key (settings display). */
    fun fingerprintOf(identityKey: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-512").digest(identityKey)
        return formatFingerprint(digest.copyOf(DISPLAY_BYTES))
    }

    /** Groups of 4 hex chars separated by spaces. */
    fun formatFingerprint(bytes: ByteArray): String =
        bytes.joinToString("") { "%02X".format(it) }
            .chunked(4)
            .joinToString(" ")

    internal fun lexicographicCompare(a: ByteArray, b: ByteArray): Int {
        val min = minOf(a.size, b.size)
        for (i in 0 until min) {
            val cmp = (a[i].toInt() and 0xFF).compareTo(b[i].toInt() and 0xFF)
            if (cmp != 0) return cmp
        }
        return a.size.compareTo(b.size)
    }
}
