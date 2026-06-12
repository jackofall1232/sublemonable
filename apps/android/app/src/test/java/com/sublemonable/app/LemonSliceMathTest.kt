// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.ui.components.LemonSliceMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** TTL countdown segment math for the lemon slice burn timer. */
class LemonSliceMathTest {

    @Test
    fun `full ttl lights all eight segments`() {
        assertEquals(8, LemonSliceMath.segmentsRemaining(60_000L, 60_000L))
    }

    @Test
    fun `expired ttl lights zero segments`() {
        assertEquals(0, LemonSliceMath.segmentsRemaining(0L, 60_000L))
        assertEquals(0, LemonSliceMath.segmentsRemaining(-500L, 60_000L))
    }

    @Test
    fun `segments extinguish one by one as time passes`() {
        val ttl = 80_000L
        // Each segment covers 10s of an 80s TTL.
        assertEquals(8, LemonSliceMath.segmentsRemaining(80_000L, ttl))
        assertEquals(7, LemonSliceMath.segmentsRemaining(70_000L, ttl))
        assertEquals(4, LemonSliceMath.segmentsRemaining(40_000L, ttl))
        assertEquals(1, LemonSliceMath.segmentsRemaining(10_000L, ttl))
        // Any remaining time keeps at least one segment lit.
        assertEquals(1, LemonSliceMath.segmentsRemaining(1L, ttl))
    }

    @Test
    fun `zero or negative ttl never lights segments`() {
        assertEquals(0, LemonSliceMath.segmentsRemaining(10_000L, 0L))
        assertEquals(0, LemonSliceMath.segmentsRemaining(10_000L, -1L))
    }

    @Test
    fun `burn stage shifts lemon to orange to red near the end`() {
        assertEquals(LemonSliceMath.BurnStage.NORMAL, LemonSliceMath.stageFor(8))
        assertEquals(LemonSliceMath.BurnStage.NORMAL, LemonSliceMath.stageFor(3))
        assertEquals(LemonSliceMath.BurnStage.CRITICAL, LemonSliceMath.stageFor(2))
        assertEquals(LemonSliceMath.BurnStage.FINAL, LemonSliceMath.stageFor(1))
        assertEquals(LemonSliceMath.BurnStage.EXPIRED, LemonSliceMath.stageFor(0))
    }

    @Test
    fun `warning pulse triggers under ten percent remaining`() {
        assertTrue(LemonSliceMath.shouldPulseWarning(5_000L, 60_000L))
        assertFalse(LemonSliceMath.shouldPulseWarning(30_000L, 60_000L))
        assertFalse(LemonSliceMath.shouldPulseWarning(0L, 60_000L))
        assertFalse(LemonSliceMath.shouldPulseWarning(5_000L, 0L))
    }

    @Test
    fun `segment geometry covers the circle without overlap`() {
        val sweep = LemonSliceMath.segmentSweepDegrees()
        val total = (sweep + LemonSliceMath.SEGMENT_GAP_DEGREES) * LemonSliceMath.SEGMENT_COUNT
        assertEquals(360f, total, 0.001f)
        // Segment 0 starts just after 12 o'clock (-90 degrees).
        assertEquals(
            -90f + LemonSliceMath.SEGMENT_GAP_DEGREES / 2f,
            LemonSliceMath.segmentStartAngleDegrees(0),
            0.001f,
        )
    }

    @Test
    fun `spinner alpha is brightest at the head and fades behind`() {
        val headAlpha = LemonSliceMath.spinnerSegmentAlpha(4, 4.0f)
        val tailAlpha = LemonSliceMath.spinnerSegmentAlpha(0, 4.0f)
        assertTrue(headAlpha > tailAlpha)
        // All alphas stay within renderable range.
        for (i in 0 until 8) {
            val alpha = LemonSliceMath.spinnerSegmentAlpha(i, 2.5f)
            assertTrue(alpha in 0.0f..1.0f)
        }
    }
}
