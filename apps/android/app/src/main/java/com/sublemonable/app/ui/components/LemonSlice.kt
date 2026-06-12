// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.BurnRed
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.LemonBright
import com.sublemonable.app.ui.theme.LemonDeep
import com.sublemonable.app.ui.theme.LemonGlow30
import com.sublemonable.app.ui.theme.Motion
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.VerifiedGreen

// ===========================================================================
// THE LEMON SLICE — the signature element of Sublemonable.
//
// A segmented circle drawn on Canvas. It appears as the logo mark, the only
// loading indicator in the app, the burn timer on ephemeral messages, the
// security verification badge and the send button. Every moment of waiting,
// protecting or destroying is rendered through this one motif.
// ===========================================================================

/**
 * Base lemon slice renderer.
 *
 * @param filledSegments how many of the 8 wedges are lit (0..8). Lit wedges
 *  use [segmentColor]; unlit wedges use [emptyColor].
 * @param segmentAlphas optional per-segment alpha override (spinner tail).
 * @param rotationDegrees rotates the whole slice (spinner motion).
 */
@Composable
fun LemonSlice(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    filledSegments: Int = LemonSliceMath.SEGMENT_COUNT,
    segmentColor: Color = Lemon,
    emptyColor: Color = BorderColor,
    rindColor: Color = LemonDeep,
    pipColor: Color = segmentColor,
    segmentAlphas: List<Float>? = null,
    rotationDegrees: Float = 0f,
) {
    Canvas(modifier = modifier.size(size)) {
        drawLemonSlice(
            filledSegments = filledSegments,
            segmentColor = segmentColor,
            emptyColor = emptyColor,
            rindColor = rindColor,
            pipColor = pipColor,
            segmentAlphas = segmentAlphas,
            rotationDegrees = rotationDegrees,
        )
    }
}

/** Variant 1 — static logo mark, all 8 segments lit. */
@Composable
fun LemonSliceLogo(
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    tint: Color = Lemon,
) {
    LemonSlice(
        modifier = modifier.semantics { contentDescription = "Sublemonable" },
        size = size,
        filledSegments = LemonSliceMath.SEGMENT_COUNT,
        segmentColor = tint,
        rindColor = if (tint == Lemon) LemonDeep else tint,
    )
}

/**
 * Variant 2 — loading spinner. Segments illuminate clockwise with a fading
 * tail. Critical rule: this is the ONLY loading indicator in the app.
 */
@Composable
fun LemonSliceSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val transition = rememberInfiniteTransition(label = "lemonSpinner")
    val head by transition.animateFloat(
        initialValue = 0f,
        targetValue = LemonSliceMath.SEGMENT_COUNT.toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 960, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "spinnerHead",
    )
    val alphas = List(LemonSliceMath.SEGMENT_COUNT) { index ->
        LemonSliceMath.spinnerSegmentAlpha(index, head)
    }
    LemonSlice(
        modifier = modifier.semantics { contentDescription = "Loading" },
        size = size,
        filledSegments = LemonSliceMath.SEGMENT_COUNT,
        segmentColor = Lemon,
        segmentAlphas = alphas,
    )
}

/**
 * Variant 3 — burn timer. Segments extinguish as TTL counts down and the
 * remaining wedges shift lemon -> orange -> red near the end
 * (design_system.components.burn_timer_ring).
 */
@Composable
fun LemonSliceBurnTimer(
    remainingMillis: Long,
    ttlMillis: Long,
    modifier: Modifier = Modifier,
    size: Dp = 16.dp,
) {
    val segments = LemonSliceMath.segmentsRemaining(remainingMillis, ttlMillis)
    val color = when (LemonSliceMath.stageFor(segments)) {
        LemonSliceMath.BurnStage.NORMAL -> Lemon
        LemonSliceMath.BurnStage.CRITICAL -> BurnOrange
        LemonSliceMath.BurnStage.FINAL -> BurnRed
        LemonSliceMath.BurnStage.EXPIRED -> BurnRed
    }
    LemonSlice(
        modifier = modifier.semantics { contentDescription = "Disappearing message timer" },
        size = size,
        filledSegments = segments,
        segmentColor = color,
        rindColor = color.copy(alpha = 0.5f),
        pipColor = color,
    )
}

/** Variant 4 — security indicator: 0..8 segments fill with verification level. */
@Composable
fun LemonSliceSecurity(
    level: Int,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    verified: Boolean = false,
) {
    val color = if (verified) VerifiedGreen else Lemon
    LemonSlice(
        modifier = modifier.semantics {
            contentDescription = "Security level $level of ${LemonSliceMath.SEGMENT_COUNT}"
        },
        size = size,
        filledSegments = level.coerceIn(0, LemonSliceMath.SEGMENT_COUNT),
        segmentColor = color,
        rindColor = color.copy(alpha = 0.6f),
    )
}

/**
 * Variant 5 — send button. A 40dp lemon circle holding the slice mark.
 * Pressed state scales to 0.92 and springs back with the bounce easing
 * (design_system.components.compose_bar.send_button).
 */
@Composable
fun LemonSendButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: Dp = 40.dp,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.92f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "sendButtonScale",
    )
    val background = if (pressed) LemonBright else Lemon
    Box(
        modifier = modifier
            .size(size)
            .scale(scale)
            // Lemon glow halo (shadows.lemon_glow_sm), brightest while pressed.
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(LemonGlow30, Color.Transparent),
                ),
                shape = CircleShape,
            )
            .background(color = if (enabled) background else BorderColor, shape = CircleShape)
            .clickable(
                interactionSource = interactionSource,
                // Press feedback is the 0.92 scale + brighter lemon —
                // no ripple needed (and none of Material's default blue).
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .semantics { contentDescription = "Send encrypted message" },
        contentAlignment = Alignment.Center,
    ) {
        LemonSlice(
            size = size * 0.55f,
            filledSegments = LemonSliceMath.SEGMENT_COUNT,
            segmentColor = if (enabled) TextOnLemon else BackgroundPrimary,
            rindColor = if (enabled) TextOnLemon else BackgroundPrimary,
            pipColor = if (enabled) TextOnLemon else BackgroundPrimary,
        )
    }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draws the slice: outer rind ring, 8 annular wedges with gaps, centre pip.
 */
fun DrawScope.drawLemonSlice(
    filledSegments: Int,
    segmentColor: Color,
    emptyColor: Color,
    rindColor: Color,
    pipColor: Color,
    segmentAlphas: List<Float>? = null,
    rotationDegrees: Float = 0f,
) {
    val canvasSize = this.size.minDimension
    val center = Offset(this.size.width / 2f, this.size.height / 2f)
    val outerRadius = canvasSize / 2f
    val rindStroke = (outerRadius * 0.10f).coerceAtLeast(1f)

    // Rind ring
    drawCircle(
        color = rindColor,
        radius = outerRadius - rindStroke / 2f,
        center = center,
        style = Stroke(width = rindStroke),
    )

    val wedgeOuter = outerRadius - rindStroke * 1.9f
    val wedgeInner = outerRadius * 0.18f
    val sweep = LemonSliceMath.segmentSweepDegrees()

    for (index in 0 until LemonSliceMath.SEGMENT_COUNT) {
        val start = LemonSliceMath.segmentStartAngleDegrees(index) + rotationDegrees
        val lit = index < filledSegments
        val baseColor = if (lit) segmentColor else emptyColor
        val alpha = segmentAlphas?.getOrNull(index) ?: 1f
        val path = Path().apply {
            arcTo(
                rect = Rect(
                    offset = Offset(center.x - wedgeOuter, center.y - wedgeOuter),
                    size = Size(wedgeOuter * 2f, wedgeOuter * 2f),
                ),
                startAngleDegrees = start,
                sweepAngleDegrees = sweep,
                forceMoveTo = true,
            )
            arcTo(
                rect = Rect(
                    offset = Offset(center.x - wedgeInner, center.y - wedgeInner),
                    size = Size(wedgeInner * 2f, wedgeInner * 2f),
                ),
                startAngleDegrees = start + sweep,
                sweepAngleDegrees = -sweep,
                forceMoveTo = false,
            )
            close()
        }
        drawPath(path = path, color = baseColor, alpha = alpha)
    }

    // Centre pip
    drawCircle(
        color = pipColor,
        radius = (wedgeInner * 0.45f).coerceAtLeast(0.5f),
        center = center,
    )
}
