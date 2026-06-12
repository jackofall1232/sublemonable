// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.PillShape
import com.sublemonable.app.ui.theme.TextSecondary
import com.sublemonable.app.ui.theme.VerifiedGreen

/**
 * Encryption status badge (design_system.components.security_badge):
 *  - verified:   green, fully lit slice, "Keys verified"
 *  - unverified: muted, outline slice, "Tap to verify"
 *  - warning:    orange, "Key changed — verify identity"
 */
enum class SecurityState { VERIFIED, UNVERIFIED, WARNING }

@Composable
fun SecurityBadge(
    state: SecurityState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (color, label, level) = when (state) {
        SecurityState.VERIFIED -> Triple(VerifiedGreen, "Keys verified", LemonSliceMath.SEGMENT_COUNT)
        SecurityState.UNVERIFIED -> Triple(TextSecondary, "Tap to verify", 0)
        SecurityState.WARNING -> Triple(BurnOrange, "Key changed — verify identity", 0)
    }

    Row(
        modifier = modifier
            .background(BackgroundElevated, PillShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        LemonSliceSecurity(
            level = level,
            size = 14.dp,
            verified = state == SecurityState.VERIFIED,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}
