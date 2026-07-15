// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.diagnostics.BootDiagnostics
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM coverage of the diagnostics rotation cap (the unbounded-growth
 * guard). The file/Context path needs an instrumented test; the cap itself is
 * pure and is verified here.
 */
class BootDiagnosticsTest {

    @Test
    fun `keeps only the most recent MAX_ENTRIES lines`() {
        var acc = emptyList<String>()
        for (i in 1..(BootDiagnostics.MAX_ENTRIES + 12)) {
            acc = BootDiagnostics.rotateEntries(acc, "line $i", BootDiagnostics.MAX_ENTRIES)
        }
        assertEquals(BootDiagnostics.MAX_ENTRIES, acc.size)
        // The oldest 12 fell off; the window ends on the newest line.
        assertEquals("line 13", acc.first())
        assertEquals("line ${BootDiagnostics.MAX_ENTRIES + 12}", acc.last())
    }

    @Test
    fun `preserves order and does not drop below the cap`() {
        val out = BootDiagnostics.rotateEntries(listOf("a", "b"), "c", 50)
        assertEquals(listOf("a", "b", "c"), out)
    }

    @Test
    fun `max of zero yields an empty log`() {
        val out = BootDiagnostics.rotateEntries(listOf("a", "b"), "c", 0)
        assertTrue(out.isEmpty())
    }
}
