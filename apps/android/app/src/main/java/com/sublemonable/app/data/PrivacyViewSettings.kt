// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

/**
 * v1.5 privacy-view and platform-warning logic (UI layer only — never touches
 * crypto or the message envelope). Mirrors packages/protocol privacy.ts.
 *
 * Privacy view blurs message content behind a frosted lemon overlay, revealed
 * only while actively interacting. On Android, FLAG_SECURE still hard-blocks
 * screenshots regardless of privacy-view state.
 */
enum class RevealMode { HOLD_TO_REVEAL, TAP_TIMED, TAP_TOGGLE }

enum class Platform { IOS, ANDROID, BROWSER }

val TAP_TIMED_DURATIONS_SECONDS = listOf(5, 10, 30)
const val TAP_TIMED_DEFAULT_SECONDS = 10

data class PrivacyViewSettings(
    /** Applies privacy view to every conversation. */
    val globalEnabled: Boolean = false,
    /** Per-conversation overrides, keyed by peer ID. */
    val perConversation: Map<String, Boolean> = emptyMap(),
    val revealMode: RevealMode = RevealMode.HOLD_TO_REVEAL,
    val tapTimedSeconds: Int = TAP_TIMED_DEFAULT_SECONDS,
) {
    /** True if privacy view is active for a given conversation. */
    fun activeFor(peerId: String): Boolean = perConversation[peerId] ?: globalEnabled
}

/** Warning copy for the platform badge — browser clients can't block screenshots. */
object PlatformWarning {
    const val CONTACT_ON_BROWSER = "🌐 Messaging via browser — screenshot protection unavailable"
    const val OWN_BROWSER = "🌐 You're on browser — your messages can be screenshotted"

    data class Result(val show: Boolean, val copy: String)

    /** Whether to warn, and which copy, given who is on what. */
    fun forPlatforms(own: Platform, contact: Platform?): Result = when {
        own == Platform.BROWSER -> Result(true, OWN_BROWSER)
        contact == Platform.BROWSER -> Result(true, CONTACT_ON_BROWSER)
        else -> Result(false, "")
    }
}
