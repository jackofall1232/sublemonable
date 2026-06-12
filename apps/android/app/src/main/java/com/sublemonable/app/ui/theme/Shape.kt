// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// design_system.tokens.radius
object Radius {
    val Sm = 6.dp
    val Md = 12.dp
    val Lg = 18.dp
    val Xl = 24.dp
}

/** Sent bubble — 18 / 18 / 4 / 18 (tail at bottom-end). */
val BubbleSentShape = RoundedCornerShape(
    topStart = 18.dp,
    topEnd = 18.dp,
    bottomEnd = 4.dp,
    bottomStart = 18.dp,
)

/** Received bubble — 18 / 18 / 18 / 4 (tail at bottom-start). */
val BubbleReceivedShape = RoundedCornerShape(
    topStart = 18.dp,
    topEnd = 18.dp,
    bottomEnd = 18.dp,
    bottomStart = 4.dp,
)

val PillShape = RoundedCornerShape(percent = 50)
val CircleButtonShape = CircleShape

val SublemonableShapes = Shapes(
    extraSmall = RoundedCornerShape(Radius.Sm),
    small = RoundedCornerShape(Radius.Sm),
    medium = RoundedCornerShape(Radius.Md),
    large = RoundedCornerShape(Radius.Lg),
    extraLarge = RoundedCornerShape(Radius.Xl),
)
