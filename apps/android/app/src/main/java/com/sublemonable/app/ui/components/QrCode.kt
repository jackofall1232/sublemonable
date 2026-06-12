// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.LemonPale

/**
 * QR code rendered straight from a zxing BitMatrix on a Compose Canvas —
 * no bitmap allocation, no I/O, fully offline. Border is lemon-yellow with
 * rounded corners (design_system.components.key_fingerprint.qr_code_border).
 *
 * The light surface inside is LemonPale (#FFFDE0) — a brand token, used here
 * solely because QR scanners need light-on-dark contrast.
 */
@Composable
fun QrCode(
    content: String,
    modifier: Modifier = Modifier,
    size: Dp = 220.dp,
) {
    val matrix = remember(content) {
        QRCodeWriter().encode(
            content,
            BarcodeFormat.QR_CODE,
            QR_SIZE_HINT,
            QR_SIZE_HINT,
            mapOf(EncodeHintType.MARGIN to 1),
        )
    }

    Canvas(
        modifier = modifier
            .size(size)
            .border(2.dp, Lemon, RoundedCornerShape(16.dp))
            .padding(6.dp)
            .background(LemonPale, RoundedCornerShape(12.dp))
            .padding(10.dp),
    ) {
        val cols = matrix.width
        val rows = matrix.height
        val cellW = this.size.width / cols
        val cellH = this.size.height / rows
        for (y in 0 until rows) {
            for (x in 0 until cols) {
                if (matrix.get(x, y)) {
                    drawRect(
                        color = BackgroundPrimary,
                        topLeft = Offset(x * cellW, y * cellH),
                        size = Size(cellW + 0.5f, cellH + 0.5f),
                    )
                }
            }
        }
    }
}

private const val QR_SIZE_HINT = 256
