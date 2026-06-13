// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

/**
 * v1.5 connection modes. Three user-selectable bundles that compose the
 * network-layer features of the security onion. Values MUST stay in lockstep
 * with packages/protocol connection.ts.
 *
 * Tor is the default transport in every mode — clearnet is only ever a flagged
 * fallback, never a primary choice.
 */
enum class CoverTrafficIntensity { OFF, LOW, MEDIUM, HIGH }

/** Live transport state shown by the connection-mode badge. */
enum class TransportState { TOR, CLEARNET_FALLBACK, OFFLINE }

enum class ConnectionMode(
    val label: String,
    val relayHops: Int,
    val decoyTraffic: Boolean,
    val decoyIntensity: CoverTrafficIntensity,
    /** Ghost: every message is a dead drop; no direct channel exists. */
    val deadDrop: Boolean,
    /** Lemon-slice segments lit for this mode's badge (of 8). */
    val litSegments: Int,
    val description: String,
) {
    STANDARD(
        label = "Standard",
        relayHops = 1,
        decoyTraffic = false,
        decoyIntensity = CoverTrafficIntensity.OFF,
        deadDrop = false,
        litSegments = 1,
        description = "Tor routing + single relay hop + Sealed Sender. Suitable for everyday use.",
    ),
    STEALTH(
        label = "Stealth",
        relayHops = 3,
        decoyTraffic = true,
        decoyIntensity = CoverTrafficIntensity.MEDIUM,
        deadDrop = false,
        litSegments = 3,
        description = "Tor routing + 3-hop onion relay + decoy traffic. For sensitive communications.",
    ),
    GHOST(
        label = "Ghost",
        relayHops = 3,
        decoyTraffic = true,
        decoyIntensity = CoverTrafficIntensity.HIGH,
        deadDrop = true,
        litSegments = 8,
        description = "Tor + 3-hop relay + continuous decoy traffic + dead drop only. " +
            "No persistent identity visible on the network.",
    ),
    ;

    /** Tor is always on in v1.5 — clearnet is fallback, not a mode. */
    val tor: Boolean get() = true

    companion object {
        val DEFAULT = STANDARD

        /** Decoy cadence per intensity as [minSeconds, maxSeconds], or null for no standing cadence. */
        fun cadenceSeconds(intensity: CoverTrafficIntensity): Pair<Int, Int>? = when (intensity) {
            CoverTrafficIntensity.OFF -> null
            CoverTrafficIntensity.LOW -> null // one decoy per real message — event-driven
            CoverTrafficIntensity.MEDIUM -> 30 to 120
            CoverTrafficIntensity.HIGH -> 5 to 30
        }
    }
}
