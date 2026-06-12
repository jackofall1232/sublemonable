// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.BurnRed
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.Motion
import kotlin.random.Random

/**
 * The burn animation — flame particles dissolving UPWARD over 600ms.
 *
 * Critical rule: burning is a particle dissolve, never a plain opacity fade.
 * The bubble content shrinks away beneath while these embers rise, drift and
 * cool from lemon through orange to red (animation_moments.message_burn).
 */

private class BurnParticle(
    /** Horizontal origin as a fraction of width. */
    val xFrac: Float,
    /** Vertical origin as a fraction of height. */
    val yFrac: Float,
    /** Particle radius as a fraction of height. */
    val radiusFrac: Float,
    /** How far the particle rises, in multiples of the bubble height. */
    val rise: Float,
    /** Sideways drift as a fraction of width. */
    val drift: Float,
    /** Per-particle stagger: particle is born at this progress value. */
    val birth: Float,
)

private fun generateParticles(count: Int, seed: Int): List<BurnParticle> {
    val random = Random(seed)
    return List(count) {
        BurnParticle(
            xFrac = random.nextFloat(),
            yFrac = 0.15f + random.nextFloat() * 0.85f,
            radiusFrac = 0.04f + random.nextFloat() * 0.08f,
            rise = 1.2f + random.nextFloat() * 1.8f,
            drift = (random.nextFloat() - 0.5f) * 0.3f,
            birth = random.nextFloat() * 0.35f,
        )
    }
}

/**
 * Drives burn progress 0 -> 1 over 600ms with the burn easing the moment
 * [burning] flips true, then invokes [onFinished] exactly once.
 */
@Composable
fun rememberBurnProgress(burning: Boolean, onFinished: () -> Unit = {}): Float {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(burning) {
        if (burning) {
            progress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = Motion.DurationDramaticMs,
                    easing = Motion.EasingBurn,
                ),
            )
            onFinished()
        }
    }
    return progress.value
}

/**
 * Renders the rising ember field for a given [progress] (0..1). Place this
 * OVER the burning content, matching its bounds.
 */
@Composable
fun BurnParticles(
    progress: Float,
    modifier: Modifier = Modifier,
    seed: Int = 0,
    particleCount: Int = 42,
) {
    val particles = remember(seed, particleCount) { generateParticles(particleCount, seed) }
    Canvas(modifier = modifier) {
        if (progress <= 0f || progress >= 1f) return@Canvas
        particles.forEach { particle ->
            // Each particle lives from its birth moment to the end.
            val life = ((progress - particle.birth) / (1f - particle.birth)).coerceIn(0f, 1f)
            if (life <= 0f) return@forEach

            val x = size.width * (particle.xFrac + particle.drift * life)
            val y = size.height * particle.yFrac - size.height * particle.rise * life
            val alpha = (1f - life) * (1f - life)
            val radius = size.height * particle.radiusFrac * (1f - life * 0.5f)

            // Embers cool as they rise: lemon -> orange -> red.
            val color = if (life < 0.5f) {
                lerp(Lemon, BurnOrange, life * 2f)
            } else {
                lerp(BurnOrange, BurnRed, (life - 0.5f) * 2f)
            }

            drawCircle(
                color = color,
                radius = radius.coerceAtLeast(0.5f),
                center = Offset(x, y),
                alpha = alpha,
            )
        }
    }
}

/** Flame gradient swatch used by burn-adjacent UI (gradients.message_burn). */
val BurnGradientColors: List<Color> = listOf(BurnRed, BurnOrange, Lemon)
