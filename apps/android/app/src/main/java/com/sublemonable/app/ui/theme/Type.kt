// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.sublemonable.app.R

// ---------------------------------------------------------------------------
// Font families — design_system.tokens.typography
//
// Display: spec asks for Clash Display with 'Space Grotesk' as fallback.
// Clash Display (Fontshare) cannot be redistributed in this repo, so the
// declared fallback is bundled instead. Drop clash_display_*.ttf into
// res/font and add them here to upgrade.
// ---------------------------------------------------------------------------
val DisplayFamily = FontFamily(
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_semibold, FontWeight.SemiBold),
    Font(R.font.space_grotesk_bold, FontWeight.Bold),
)

val BodyFamily = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
)

/**
 * JetBrains Mono. Critical rule: key fingerprints, security codes and
 * timestamps ALWAYS render in this family.
 */
val MonoFamily = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
)

// Type scale — design_system.tokens.typography.scale (1rem == 16sp here).
object TypeScale {
    val Xs = 12.sp
    val Sm = 14.sp
    val Base = 16.sp
    val Lg = 18.sp
    val Xl = 20.sp
    val Xxl = 24.sp
    val Xxxl = 30.sp
    val Display = 36.sp
    val Hero = 48.sp
    /** Message bubble body — 0.9375rem from design_system.components.message_bubble. */
    val Message = 15.sp
}

val SublemonableTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = TypeScale.Hero,
        letterSpacing = (-0.03).em,
    ),
    displayMedium = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = TypeScale.Display,
        letterSpacing = (-0.03).em,
    ),
    displaySmall = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = TypeScale.Xxxl,
        letterSpacing = (-0.03).em,
    ),
    headlineLarge = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = TypeScale.Xxl,
        letterSpacing = (-0.03).em,
    ),
    headlineMedium = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = TypeScale.Xl,
        letterSpacing = (-0.03).em,
    ),
    headlineSmall = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.Medium,
        fontSize = TypeScale.Lg,
        letterSpacing = (-0.03).em,
    ),
    titleLarge = TextStyle(
        fontFamily = DisplayFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = TypeScale.Xl,
        letterSpacing = (-0.03).em,
    ),
    titleMedium = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Medium,
        fontSize = TypeScale.Base,
    ),
    titleSmall = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Medium,
        fontSize = TypeScale.Sm,
    ),
    bodyLarge = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Normal,
        fontSize = TypeScale.Base,
    ),
    bodyMedium = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Normal,
        fontSize = TypeScale.Message,
    ),
    bodySmall = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Normal,
        fontSize = TypeScale.Sm,
    ),
    labelLarge = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Medium,
        fontSize = TypeScale.Sm,
    ),
    labelMedium = TextStyle(
        fontFamily = BodyFamily,
        fontWeight = FontWeight.Medium,
        fontSize = TypeScale.Xs,
    ),
    labelSmall = TextStyle(
        fontFamily = MonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = TypeScale.Xs,
    ),
)

/** Mono style for key fingerprints / security codes / timestamps. */
val FingerprintTextStyle = TextStyle(
    fontFamily = MonoFamily,
    fontWeight = FontWeight.Normal,
    fontSize = TypeScale.Base,
    letterSpacing = 0.05.em,
)
