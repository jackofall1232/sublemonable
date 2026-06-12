// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BackgroundSecondary
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary

/**
 * Minimal "add contact" dialog. Discovery is QR or direct link
 * (features.accounts.discovery) — in-app QR SCANNING ships later, so v1
 * accepts the contact's account ID (the UUID inside their QR/link) pasted
 * directly, plus a local display name.
 */
@Composable
fun NewChatDialog(
    onDismiss: () -> Unit,
    onAdd: (contactId: String, displayName: String) -> Unit,
) {
    var contactId by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .background(BackgroundSecondary, RoundedCornerShape(18.dp))
                .border(1.dp, BorderColor, RoundedCornerShape(18.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "New encrypted chat",
                style = MaterialTheme.typography.headlineSmall,
                color = TextPrimary,
            )
            Text(
                text = "Paste the contact ID from their QR code or invite link.",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )

            DialogField(
                value = contactId,
                onValueChange = { contactId = it.trim() },
                placeholder = "Contact ID",
                mono = true,
            )
            DialogField(
                value = displayName,
                onValueChange = { displayName = it },
                placeholder = "Name (only stored on this device)",
                mono = false,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onDismiss) {
                    Text("Cancel", color = TextSecondary)
                }
                Button(
                    onClick = { onAdd(contactId, displayName.ifBlank { "Unnamed contact" }) },
                    enabled = contactId.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Lemon,
                        contentColor = TextOnLemon,
                    ),
                ) {
                    Text("Add")
                }
            }
        }
    }
}

@Composable
private fun DialogField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    mono: Boolean,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(BackgroundElevated, RoundedCornerShape(12.dp))
            .border(1.dp, if (value.isBlank()) BorderColor else Lemon, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        if (value.isEmpty()) {
            Text(
                text = placeholder,
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = if (mono) {
                MaterialTheme.typography.bodySmall.copy(
                    color = TextPrimary,
                    fontFamily = MonoFamily,
                )
            } else {
                MaterialTheme.typography.bodySmall.copy(color = TextPrimary)
            },
            cursorBrush = SolidColor(Lemon),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
