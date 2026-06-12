// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.security.RootDetection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RootDetectionTest {

    @Test
    fun `clean device reports no suspicious paths`() {
        val found = RootDetection.findSuspiciousPaths(exists = { false })
        assertTrue(found.isEmpty())
    }

    @Test
    fun `su binary is detected wherever it hides`() {
        RootDetection.SU_PATHS.forEach { suPath ->
            val found = RootDetection.findSuspiciousPaths(exists = { it == suPath })
            assertEquals(listOf(suPath), found)
        }
    }

    @Test
    fun `magisk traces are detected`() {
        val found = RootDetection.findSuspiciousPaths(exists = { it == "/data/adb/magisk" })
        assertEquals(listOf("/data/adb/magisk"), found)
    }

    @Test
    fun `path list covers the canonical su locations`() {
        assertTrue("/system/bin/su" in RootDetection.SU_PATHS)
        assertTrue("/system/xbin/su" in RootDetection.SU_PATHS)
        assertTrue("/sbin/su" in RootDetection.SU_PATHS)
        // No duplicates — each path checked exactly once.
        val all = RootDetection.SU_PATHS + RootDetection.MAGISK_PATHS
        assertEquals(all.size, all.toSet().size)
    }

    @Test
    fun `test-keys build tags are flagged`() {
        assertTrue(RootDetection.isTestKeysBuild("release-keys/test-keys"))
        assertTrue(RootDetection.isTestKeysBuild("test-keys"))
        assertFalse(RootDetection.isTestKeysBuild("release-keys"))
        assertFalse(RootDetection.isTestKeysBuild(null))
    }
}
