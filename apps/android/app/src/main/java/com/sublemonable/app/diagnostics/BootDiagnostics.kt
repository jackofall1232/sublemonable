// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.diagnostics

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * On-device, privacy-safe boot diagnostics — a readable alternative to
 * `adb logcat` for users who hit connection problems and have no second
 * machine (the common case: `adb` isn't available on the device or in the
 * terminal environments people actually have on hand).
 *
 * Each entry is a single boot-stage marker or a transport exception
 * (class + message), prefixed with a UTC timestamp. This is EXACTLY the
 * content the boot loop already emits to logcat via [com.sublemonable.app
 * .MessagingCoordinator]: fixed stage strings and exception metadata only —
 * never message content, keys, tokens, account ids, or envelope fields, so
 * the file is safe for a user to copy and share verbatim in a bug report.
 *
 * Storage: a plain text file in app-private storage ([Context.getFilesDir]),
 * which no other app can read (absent root) and which is never included in
 * backups (the app sets `allowBackup=false`). The log is capped at the most
 * recent [MAX_ENTRIES] lines so it can never grow unbounded.
 *
 * All writes are best-effort: a diagnostics IO failure (e.g. a full disk)
 * must NEVER be able to break the boot path, so every disk operation is
 * wrapped and swallowed.
 */
class BootDiagnostics(context: Context) {

    private val file = File(context.filesDir, FILE_NAME)

    // Serializes the read-modify-write in record()/clear(): record() runs on
    // the boot coroutine while the Diagnostics screen may read concurrently.
    private val lock = Any()

    private val _entries = MutableStateFlow(loadEntries())

    /**
     * Recorded lines, oldest-first / most-recent-last. The Diagnostics screen
     * observes this so a boot attempt made while the screen is open shows up
     * live, letting a user watch the exact failure happen.
     */
    val entries: StateFlow<List<String>> = _entries.asStateFlow()

    /**
     * Append one privacy-safe [line] (timestamped, UTC) and rotate to the last
     * [MAX_ENTRIES]. Never throws.
     */
    fun record(line: String) {
        val stamped = "${TS.format(Instant.now())}  $line"
        synchronized(lock) {
            val next = rotateEntries(loadEntries(), stamped, MAX_ENTRIES)
            runCatching { file.writeText(next.joinToString("\n") + "\n") }
            _entries.value = next
        }
    }

    /** Full contents as one string, for display and copy. Empty when no runs yet. */
    fun readAll(): String = entries.value.joinToString("\n")

    /** Wipe the log — a user action from the Diagnostics screen. */
    fun clear() {
        synchronized(lock) {
            runCatching { if (file.exists()) file.delete() }
            _entries.value = emptyList()
        }
    }

    private fun loadEntries(): List<String> = runCatching {
        if (file.exists()) file.readText().split("\n").filter { it.isNotBlank() } else emptyList()
    }.getOrDefault(emptyList())

    companion object {
        private const val FILE_NAME = "boot-diagnostics.log"

        /** Rotation cap — only the most recent this-many lines are kept. */
        const val MAX_ENTRIES = 50

        private val TS: DateTimeFormatter =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC)

        /**
         * Pure rotation: append [newEntry] and keep only the last [max] lines.
         * Extracted so the cap (the unbounded-growth guard) is unit-testable
         * without an Android [Context]. [max] is floored at 0.
         */
        internal fun rotateEntries(existing: List<String>, newEntry: String, max: Int): List<String> =
            (existing + newEntry).takeLast(max.coerceAtLeast(0))
    }
}
