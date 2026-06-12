// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.theme

import androidx.compose.ui.graphics.Color

// ---------------------------------------------------------------------------
// Core palette — design_system.tokens.color.core
// ---------------------------------------------------------------------------
val Lemon = Color(0xFFF5E642)
val LemonBright = Color(0xFFFFE500)
val LemonDeep = Color(0xFFD4C200)
val LemonPale = Color(0xFFFFFDE0)
val LemonZest = Color(0xFFE8B800)
val Rind = Color(0xFF2A2500)
val RindSoft = Color(0xFF3D3800)
val Pulp = Color(0xFFFFF8C0)
val OffWhite = Color(0xFFFAFAF2)

// ---------------------------------------------------------------------------
// Semantic palette — design_system.tokens.color.semantic
// Critical rule: NEVER use white backgrounds. The minimum dark value used as
// a background anywhere in this app is BackgroundSecondary (#1A1800).
// ---------------------------------------------------------------------------
val BackgroundPrimary = Color(0xFF0D0C00)
val BackgroundSecondary = Color(0xFF1A1800)
val BackgroundElevated = Color(0xFF242100)
val BackgroundMessageSent = Color(0xFFF5E642)
val BackgroundMessageReceived = Color(0xFF242100)
val TextPrimary = Color(0xFFFAFAF2)
val TextSecondary = Color(0xFFA8A070)
val TextOnLemon = Color(0xFF0D0C00)
val TextMuted = Color(0xFF5A5630)
val BorderColor = Color(0xFF2E2B00)
val BorderActive = Color(0xFFF5E642)
val BurnRed = Color(0xFFFF4444)
val BurnOrange = Color(0xFFFF8C00)
val VerifiedGreen = Color(0xFF4ADE80)
val ErrorRed = Color(0xFFFF4444)
val SuccessGreen = Color(0xFF4ADE80)

// Lemon glow at the alphas used by the shadow tokens.
val LemonGlow30 = Color(0x4DF5E642) // rgba(245,230,66,0.30)
val LemonGlow20 = Color(0x33F5E642) // rgba(245,230,66,0.20)
val LemonGlow15 = Color(0x26F5E642) // rgba(245,230,66,0.15)
val BurnGlow40 = Color(0x66FF4444) // rgba(255,68,68,0.40)
