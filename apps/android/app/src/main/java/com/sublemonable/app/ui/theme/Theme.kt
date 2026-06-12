// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

// ---------------------------------------------------------------------------
// Motion tokens — design_system.tokens.motion
// ---------------------------------------------------------------------------
object Motion {
    const val DurationFastMs = 120
    const val DurationBaseMs = 200
    const val DurationSlowMs = 400
    const val DurationDramaticMs = 600

    val EasingDefault = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
    val EasingBounce = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f)
    val EasingBurn = CubicBezierEasing(0.4f, 0f, 1f, 1f)
}

/**
 * Dark only — there is no light theme in v1 and the system setting is
 * deliberately ignored (critical rule: never white backgrounds, minimum
 * dark value #1A1800). Lemon yellow #F5E642 owns ALL interactivity;
 * nothing interactive is ever blue.
 */
private val SublemonableColorScheme = darkColorScheme(
    primary = Lemon,
    onPrimary = TextOnLemon,
    primaryContainer = LemonDeep,
    onPrimaryContainer = TextOnLemon,
    secondary = LemonZest,
    onSecondary = TextOnLemon,
    secondaryContainer = RindSoft,
    onSecondaryContainer = TextPrimary,
    tertiary = VerifiedGreen,
    onTertiary = TextOnLemon,
    background = BackgroundPrimary,
    onBackground = TextPrimary,
    surface = BackgroundSecondary,
    onSurface = TextPrimary,
    surfaceVariant = BackgroundElevated,
    onSurfaceVariant = TextSecondary,
    surfaceTint = Lemon,
    inverseSurface = LemonPale,
    inverseOnSurface = TextOnLemon,
    error = ErrorRed,
    onError = TextPrimary,
    errorContainer = BurnRed,
    onErrorContainer = TextPrimary,
    outline = BorderColor,
    outlineVariant = Rind,
    scrim = BackgroundPrimary,
)

@Composable
fun SublemonableTheme(content: @Composable () -> Unit) {
    // The system light/dark setting is never consulted: dark is the only theme.
    MaterialTheme(
        colorScheme = SublemonableColorScheme,
        typography = SublemonableTypography,
        shapes = SublemonableShapes,
        content = content,
    )
}
