// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.FingerprintTextStyle
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.TextSecondary

/**
 * Key fingerprint / safety number display
 * (design_system.components.key_fingerprint).
 *
 * Critical rule: fingerprints ALWAYS render in JetBrains Mono — groups of 4
 * hex chars separated by spaces, default colour #A8A070, highlight #F5E642.
 *
 * @param fingerprint pre-formatted groups ("89AB CDEF ...") as produced by
 *  SafetyNumber.formatFingerprint.
 * @param highlighted whether to render in the lemon highlight colour
 *  (e.g. after a successful QR comparison).
 */
@Composable
fun KeyFingerprintDisplay(
    fingerprint: String,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
    groupsPerLine: Int = 4,
) {
    val color = if (highlighted) Lemon else TextSecondary
    val lines = fingerprint
        .split(" ")
        .filter { it.isNotBlank() }
        .chunked(groupsPerLine)

    Column(
        modifier = modifier
            .background(BackgroundElevated, RoundedCornerShape(12.dp))
            .border(1.dp, BorderColor, RoundedCornerShape(12.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        lines.forEach { groups ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                groups.forEach { group ->
                    Text(
                        text = group,
                        style = FingerprintTextStyle, // JetBrains Mono — always
                        color = color,
                    )
                }
            }
        }
    }
}
