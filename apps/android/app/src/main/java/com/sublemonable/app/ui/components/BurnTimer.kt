// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Live countdown ring for a timed message — the lemon slice with segments
 * extinguishing as TTL runs out, pulsing when <10% of the time remains
 * (design_system.components.message_bubble.timed.warning_pulse).
 *
 * The countdown starts at delivery time (timer_starts: on_delivery). Actual
 * deletion is enforced by MessageRepository; this composable is display only.
 */
@Composable
fun BurnTimer(
    deliveredAtMs: Long,
    ttlSeconds: Int,
    modifier: Modifier = Modifier,
    size: Dp = 14.dp,
    tickMs: Long = 250L,
) {
    val ttlMillis = ttlSeconds * 1000L
    val expiresAt = deliveredAtMs + ttlMillis

    var remainingMillis by remember(deliveredAtMs, ttlSeconds) {
        mutableLongStateOf((expiresAt - System.currentTimeMillis()).coerceAtLeast(0L))
    }

    LaunchedEffect(deliveredAtMs, ttlSeconds) {
        while (remainingMillis > 0L) {
            delay(tickMs)
            remainingMillis = (expiresAt - System.currentTimeMillis()).coerceAtLeast(0L)
        }
    }

    val shouldPulse = LemonSliceMath.shouldPulseWarning(remainingMillis, ttlMillis)
    val pulse by rememberInfiniteTransition(label = "burnTimerPulse").animateFloat(
        initialValue = 1f,
        targetValue = 0.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 450),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "burnTimerPulseAlpha",
    )

    LemonSliceBurnTimer(
        remainingMillis = remainingMillis,
        ttlMillis = ttlMillis,
        modifier = modifier.alpha(if (shouldPulse) pulse else 1f),
        size = size,
    )
}
