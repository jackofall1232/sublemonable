// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.sublemonable.app.ui.components.LemonSlice
import com.sublemonable.app.ui.components.LemonSliceMath
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.Motion
import com.sublemonable.app.ui.theme.TextSecondary
import kotlinx.coroutines.delay

/**
 * Splash (design_system.screens.splash): segments animate in clockwise,
 * the slice pulses once, then the wordmark and tagline settle in.
 */
@Composable
fun SplashScreen(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var litSegments by remember { mutableIntStateOf(0) }
    val pulse = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        // Segments illuminate clockwise...
        while (litSegments < LemonSliceMath.SEGMENT_COUNT) {
            delay(90)
            litSegments += 1
        }
        // ...then a single pulse.
        pulse.animateTo(1.12f, tween(Motion.DurationBaseMs, easing = Motion.EasingBounce))
        pulse.animateTo(1f, tween(Motion.DurationBaseMs, easing = Motion.EasingDefault))
        delay(500)
        onFinished()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LemonSlice(
            size = 120.dp,
            filledSegments = litSegments,
            modifier = Modifier.scale(pulse.value),
        )
        Text(
            text = "SUBLEMONABLE",
            style = MaterialTheme.typography.displaySmall.copy(letterSpacing = 0.25.em),
            color = Lemon,
            modifier = Modifier.padding(top = 32.dp),
        )
        Text(
            text = "Nothing lasts. That's the point.",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}
