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
 * accepts whatever the contact shares, pasted directly: the JSON exchange
 * payload other clients embed in their QR codes, an invite link, or the raw
 * account UUID — plus a local display name.
 */
@Composable
fun NewChatDialog(
    onDismiss: () -> Unit,
    onAdd: (contactId: String, displayName: String) -> Unit,
) {
    var contactId by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var parseError by remember { mutableStateOf(false) }

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
                onValueChange = {
                    contactId = it.trim()
                    parseError = false
                },
                placeholder = "Contact ID, invite link, or QR payload",
                mono = true,
            )
            if (parseError) {
                Text(
                    text = "Couldn't find a contact ID in that — paste the QR payload, link, or UUID.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
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
                    onClick = {
                        val parsed = parseContactInput(contactId)
                        if (parsed == null) {
                            parseError = true
                        } else {
                            onAdd(parsed, displayName.ifBlank { "Unnamed contact" })
                        }
                    },
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

/**
 * Extracts the contact's account UUID from whatever was pasted:
 * - the JSON ContactExchangePayload other clients put in QR codes
 *   ({"version":"1","account_id":"<uuid>","identity_key":"<base64>"}),
 * - an invite link or any text containing a UUID,
 * - or the raw UUID itself.
 * Returns null when no UUID can be found. Pure — covered by unit tests.
 */
fun parseContactInput(input: String): String? {
    val trimmed = input.trim()
    if (trimmed.startsWith("{")) {
        try {
            val accountId = org.json.JSONObject(trimmed).optString("account_id")
            if (UUID_REGEX.matches(accountId)) return accountId.lowercase()
        } catch (_: org.json.JSONException) {
            // Fall through to the generic UUID search.
        }
    }
    return UUID_REGEX.find(trimmed)?.value?.lowercase()
}

private val UUID_REGEX = Regex(
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
)

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
