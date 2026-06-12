// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

/**
 * Basic root-detection heuristics (apps.android.features). Root weakens —
 * but does not break — the security model: a root-level attacker can read
 * app memory, so decrypted messages are exposed on-device.
 *
 * Policy: WARN, NEVER BLOCK. The user gets a dismissible banner and decides
 * for themselves. Blocking rooted users would punish power users without
 * stopping a real attacker.
 */
object RootDetection {

    /** Common locations of the `su` binary. Public for unit tests. */
    val SU_PATHS = listOf(
        "/system/bin/su",
        "/system/xbin/su",
        "/system/sbin/su",
        "/sbin/su",
        "/vendor/bin/su",
        "/su/bin/su",
        "/data/local/su",
        "/data/local/bin/su",
        "/data/local/xbin/su",
        "/system/bin/.ext/su",
        "/system/usr/we-need-root/su",
    )

    /** Filesystem traces of Magisk. Public for unit tests. */
    val MAGISK_PATHS = listOf(
        "/sbin/.magisk",
        "/cache/.disable_magisk",
        "/dev/.magisk.unblock",
        "/cache/magisk.log",
        "/data/adb/magisk",
        "/data/adb/magisk.img",
        "/data/adb/magisk.db",
        "/data/adb/modules",
    )

    /** Root-management packages worth flagging. */
    private val ROOT_PACKAGES = listOf(
        "com.topjohnwu.magisk",
        "eu.chainfire.supersu",
        "com.koushikdutta.superuser",
        "com.noshufou.android.su",
        "me.phh.superuser",
    )

    data class RootStatus(val indicators: List<String>) {
        val likelyRooted: Boolean get() = indicators.isNotEmpty()
    }

    /**
     * Pure path heuristic — injectable existence check so the logic is
     * unit-testable on the JVM without a device.
     */
    fun findSuspiciousPaths(exists: (String) -> Boolean = { File(it).exists() }): List<String> =
        (SU_PATHS + MAGISK_PATHS).filter(exists)

    /** Pure build-tags heuristic — test-keys means a non-release signing. */
    fun isTestKeysBuild(buildTags: String?): Boolean =
        buildTags?.contains("test-keys") == true

    /** Full device check. Cheap; safe to run on every cold start. */
    fun check(context: Context): RootStatus {
        val indicators = mutableListOf<String>()

        findSuspiciousPaths().forEach { indicators.add("path:$it") }

        if (isTestKeysBuild(Build.TAGS)) {
            indicators.add("build:test-keys")
        }

        ROOT_PACKAGES.forEach { pkg ->
            try {
                context.packageManager.getPackageInfo(pkg, 0)
                indicators.add("package:$pkg")
            } catch (e: PackageManager.NameNotFoundException) {
                // not installed — good
            }
        }

        return RootStatus(indicators)
    }
}
