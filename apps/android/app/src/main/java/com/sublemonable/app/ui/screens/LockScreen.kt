// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sublemonable.app.ui.components.LemonSliceLogo
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.ErrorRed
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextSecondary

/**
 * Biometric gate. Shown before any message content can render; the actual
 * BiometricPrompt is launched by MainActivity. On success the slice "opens
 * like an iris" into the chat list (animation_moments.app_unlock).
 */
@Composable
fun LockScreen(
    onUnlockRequest: () -> Unit,
    errorMessage: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LemonSliceLogo(size = 96.dp)
        Text(
            text = "Locked",
            style = MaterialTheme.typography.headlineLarge,
            color = Lemon,
            modifier = Modifier.padding(top = 24.dp),
        )
        Text(
            text = "Your keys stay sealed until you unlock.",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        )
        Button(
            onClick = onUnlockRequest,
            colors = ButtonDefaults.buttonColors(
                containerColor = Lemon,
                contentColor = TextOnLemon,
            ),
        ) {
            Text("Unlock")
        }
        if (errorMessage != null) {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = ErrorRed,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
    }
}
