// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import kotlin.math.ceil

/**
 * Pure geometry/countdown math for the lemon slice motif.
 *
 * Kept free of any Android/Compose imports so it is unit-testable on the JVM
 * (see app/src/test). The drawing code in [LemonSlice] consumes these values.
 */
object LemonSliceMath {

    /** The lemon slice always has 8 segments — logo, spinner, timer, badge. */
    const val SEGMENT_COUNT = 8

    /** Gap between wedges, in degrees, so the slice reads as segmented. */
    const val SEGMENT_GAP_DEGREES = 7f

    /** Angular width of a single wedge. */
    fun segmentSweepDegrees(): Float =
        360f / SEGMENT_COUNT - SEGMENT_GAP_DEGREES

    /**
     * Start angle of segment [index] (0-based, clockwise from 12 o'clock).
     * Compose's drawArc measures 0° at 3 o'clock, so 12 o'clock is -90°.
     */
    fun segmentStartAngleDegrees(index: Int): Float =
        -90f + index * (360f / SEGMENT_COUNT) + SEGMENT_GAP_DEGREES / 2f

    /** Fraction of TTL remaining, clamped to 0..1. */
    fun remainingFraction(remainingMillis: Long, ttlMillis: Long): Float {
        if (ttlMillis <= 0L) return 0f
        return (remainingMillis.toFloat() / ttlMillis.toFloat()).coerceIn(0f, 1f)
    }

    /**
     * How many of the 8 segments remain lit for a counting-down TTL.
     * Segments extinguish one by one; any remaining time keeps at least
     * one segment lit (ceil), and 0 means the message is gone.
     */
    fun segmentsRemaining(remainingMillis: Long, ttlMillis: Long): Int {
        if (ttlMillis <= 0L || remainingMillis <= 0L) return 0
        val raw = ceil(remainingFraction(remainingMillis, ttlMillis) * SEGMENT_COUNT).toInt()
        return raw.coerceIn(0, SEGMENT_COUNT)
    }

    /**
     * Burn timer colour stage. The countdown shifts from lemon to orange to
     * red as it approaches destruction (design_system.components.burn_timer_ring):
     * full #F5E642 -> critical #FF8C00 (2 segments) -> final #FF4444 (1 segment).
     */
    enum class BurnStage { NORMAL, CRITICAL, FINAL, EXPIRED }

    fun stageFor(segmentsRemaining: Int): BurnStage = when {
        segmentsRemaining <= 0 -> BurnStage.EXPIRED
        segmentsRemaining == 1 -> BurnStage.FINAL
        segmentsRemaining == 2 -> BurnStage.CRITICAL
        else -> BurnStage.NORMAL
    }

    /** True when <10% of TTL remains — triggers the warning glow pulse. */
    fun shouldPulseWarning(remainingMillis: Long, ttlMillis: Long): Boolean {
        if (ttlMillis <= 0L) return false
        return remainingMillis > 0 && remainingFraction(remainingMillis, ttlMillis) < 0.10f
    }

    /**
     * Per-segment alpha for the loading spinner: a bright head sweeping
     * clockwise with a tail fading behind it. [head] advances 0..8 cyclically.
     */
    fun spinnerSegmentAlpha(index: Int, head: Float): Float {
        val distanceBehindHead = (head - index).mod(SEGMENT_COUNT.toFloat())
        return (1f - distanceBehindHead / SEGMENT_COUNT).coerceIn(0.08f, 1f)
    }
}
