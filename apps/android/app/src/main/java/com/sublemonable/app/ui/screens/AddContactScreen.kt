// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.sublemonable.app.ui.components.QrCode
import com.sublemonable.app.ui.components.SecureCaptureActivity
import com.sublemonable.app.ui.components.parseContactInput
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary
import com.sublemonable.app.ui.theme.TypeScale
import com.sublemonable.app.ui.theme.VerifiedGreen

/**
 * Add-contact screen: shows your own QR / contact code to share, scans or pastes
 * someone else's. Backs the onboarding promise "Add contacts by QR code or
 * link". No phone number, email, or name — identity is the routing ID + public
 * key carried in [myContactPayload].
 *
 * [myContactPayload] is the cross-client ContactExchangePayload JSON, or null
 * before first-run registration has completed (there is no code to show yet).
 */
@Composable
fun AddContactScreen(
    myContactPayload: String?,
    onBack: () -> Unit,
    onAdd: (contactId: String, displayName: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val clipboard = LocalClipboardManager.current
    var contactInput by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var parseError by remember { mutableStateOf(false) }
    var scanned by remember { mutableStateOf(false) }

    // ZXing owns the camera + runtime permission flow; results come back here as
    // untrusted text and only ever pass through parseContactInput.
    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: return@rememberLauncherForActivityResult
        val parsed = parseContactInput(raw)
        if (parsed != null) {
            contactInput = parsed
            parseError = false
            scanned = true
        } else {
            parseError = true
            scanned = false
        }
    }

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
                text = "Add contact",
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
            )
        }

        // ----- Your code -----------------------------------------------------
        SectionLabel("Your code")
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (myContactPayload != null) {
                QrCode(content = myContactPayload, size = 220.dp)
                Text(
                    text = "Have them scan this — or send them the code. It contains only " +
                        "your routing ID and public key.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    modifier = Modifier.padding(top = 12.dp),
                )
                OutlinedButton(
                    onClick = { clipboard.setText(AnnotatedString(myContactPayload)) },
                    modifier = Modifier.padding(top = 12.dp),
                ) {
                    Text("Copy contact code", color = Lemon)
                }
            } else {
                Text(
                    text = "Your code appears once first-time setup finishes and you're " +
                        "connected to the relay.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            }
        }

        // ----- Add someone ---------------------------------------------------
        SectionLabel("Add someone")
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = {
                    scanLauncher.launch(
                        ScanOptions()
                            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            .setBeepEnabled(false)
                            .setOrientationLocked(false)
                            .setPrompt("Point at a Sublemonable contact QR")
                            .setCaptureActivity(SecureCaptureActivity::class.java),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Lemon,
                    contentColor = TextOnLemon,
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.QrCodeScanner,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 8.dp),
                )
                Text("Scan their code")
            }

            Text(
                text = "or paste their code / invite link",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )

            ContactField(
                value = contactInput,
                onValueChange = {
                    // Store raw text — trimming here can jump the cursor;
                    // parseContactInput trims at parse time anyway.
                    contactInput = it
                    parseError = false
                    scanned = false
                },
                placeholder = "Contact ID, invite link, or QR payload",
                mono = true,
            )
            if (scanned) {
                Text(
                    text = "Scanned ✓ — name them below, then Add.",
                    style = MaterialTheme.typography.bodySmall,
                    color = VerifiedGreen,
                )
            }
            if (parseError) {
                Text(
                    text = "Couldn't find a contact ID in that — scan again, or paste the " +
                        "QR payload, link, or UUID.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            ContactField(
                value = displayName,
                onValueChange = { displayName = it },
                placeholder = "Name (only stored on this device)",
                mono = false,
            )

            Button(
                onClick = {
                    val parsed = parseContactInput(contactInput)
                    if (parsed == null) {
                        parseError = true
                    } else {
                        onAdd(parsed, displayName.ifBlank { "Unnamed contact" })
                    }
                },
                enabled = contactInput.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Lemon,
                    contentColor = TextOnLemon,
                ),
            ) {
                Text("Add")
            }
        }

        Box(modifier = Modifier.padding(bottom = 24.dp))
    }
}

@Composable
private fun SectionLabel(title: String) {
    Text(
        text = title.uppercase(),
        fontFamily = MonoFamily,
        fontSize = TypeScale.Xs,
        color = TextMuted,
        modifier = Modifier
            .fillMaxWidth()
            .background(BackgroundPrimary)
            .padding(start = 16.dp, top = 24.dp, bottom = 8.dp),
    )
}

@Composable
private fun ContactField(
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
