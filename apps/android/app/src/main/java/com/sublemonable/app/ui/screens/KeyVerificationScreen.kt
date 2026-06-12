// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.ui.components.KeyFingerprintDisplay
import com.sublemonable.app.ui.components.LemonSliceSecurity
import com.sublemonable.app.ui.components.QrCode
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary
import com.sublemonable.app.ui.theme.VerifiedGreen

/**
 * Safety Number verification (features.contact_verification): SHA-512
 * fingerprint of both identity keys, rendered in JetBrains Mono, plus a QR
 * for in-person comparison. Marking verified lights the slice fully green
 * (animation_moments.key_verified).
 */
@Composable
fun KeyVerificationScreen(
    conversation: Conversation,
    safetyNumber: String,
    onBack: () -> Unit,
    onMarkVerified: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary)
            .verticalScroll(rememberScrollState()),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Lemon,
                )
            }
            Text(
                text = "Verify ${conversation.displayName}",
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LemonSliceSecurity(
                level = if (conversation.verified) 8 else 0,
                verified = conversation.verified,
                size = 56.dp,
                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
            )

            Text(
                text = if (conversation.verified) "Keys verified" else "Not verified yet",
                style = MaterialTheme.typography.titleMedium,
                color = if (conversation.verified) VerifiedGreen else TextSecondary,
            )

            Text(
                text = "Compare this safety number with ${conversation.displayName} over " +
                    "a channel you already trust — ideally in person. If the numbers " +
                    "match, your conversation cannot be intercepted.",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(vertical = 16.dp),
            )

            // Safety number — JetBrains Mono, groups of 4 (critical rule).
            KeyFingerprintDisplay(
                fingerprint = safetyNumber,
                highlighted = conversation.verified,
            )

            // QR for scanning comparison — lemon border, rounded.
            QrCode(
                content = "sublemonable:verify:${safetyNumber.replace(" ", "")}",
                modifier = Modifier.padding(vertical = 24.dp),
            )

            if (!conversation.verified) {
                Button(
                    onClick = onMarkVerified,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Lemon,
                        contentColor = TextOnLemon,
                    ),
                    modifier = Modifier.padding(bottom = 32.dp),
                ) {
                    Text("Numbers match — mark verified")
                }
            }
        }
    }
}
