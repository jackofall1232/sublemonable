// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.sublemonable.app.diagnostics.BootDiagnostics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary
import com.sublemonable.app.ui.theme.TypeScale

/**
 * Settings → Diagnostics. Shows the on-device [BootDiagnostics] log as plain,
 * selectable, copyable text so a user hitting connection problems can read and
 * share the exact failure WITHOUT needing `adb logcat` or a second machine.
 *
 * The content is privacy-safe by construction — boot stage markers plus the
 * transport exception class and message on failure (e.g. a certificate-pin
 * rejection, a TLS handshake failure, or an unreachable relay). Those messages
 * carry only transport metadata (host, port, TLS version, served SPKI hashes),
 * never message content, keys, tokens, or the account ID — see
 * [BootDiagnostics] — so there is nothing here to redact before sharing.
 */
@Composable
fun DiagnosticsScreen(
    diagnostics: BootDiagnostics,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val entries by diagnostics.entries.collectAsState()
    val clipboard = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()
    val body = remember(entries) { entries.joinToString("\n") }

    // Load any persisted log from a previous process off the main thread, so a
    // user who opens this before the app has recorded anything this run still
    // sees prior attempts.
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) { diagnostics.refresh() }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary),
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
                text = "Diagnostics",
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
            )
            Spacer(modifier = Modifier.weight(1f))
            IconButton(
                onClick = { if (body.isNotEmpty()) clipboard.setText(AnnotatedString(body)) },
            ) {
                Icon(
                    imageVector = Icons.Filled.ContentCopy,
                    contentDescription = "Copy diagnostics",
                    tint = if (body.isEmpty()) TextMuted else Lemon,
                )
            }
            IconButton(
                onClick = {
                    coroutineScope.launch { withContext(Dispatchers.IO) { diagnostics.clear() } }
                },
            ) {
                Icon(
                    imageVector = Icons.Filled.DeleteOutline,
                    contentDescription = "Clear diagnostics",
                    tint = if (body.isEmpty()) TextMuted else Lemon,
                )
            }
        }

        Text(
            text = "A local record of the app's attempts to register, connect, and send " +
                "over the relay. Privacy-safe: stage names plus error type and message — " +
                "never message content, keys, tokens, or your account ID. Copy it into a " +
                "bug report if you're stuck on “Connecting…” or a message won't send.",
            style = MaterialTheme.typography.bodySmall,
            color = TextMuted,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )

        if (entries.isEmpty()) {
            Text(
                text = "No connection attempts recorded yet.\n\nThis fills in automatically " +
                    "the next time the app tries to reach the relay — reopen this screen " +
                    "after an unlock if it stays empty.",
                style = MaterialTheme.typography.bodyMedium,
                color = TextMuted,
                modifier = Modifier.padding(16.dp),
            )
        } else {
            SelectionContainer(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    text = body,
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Xs,
                    color = TextSecondary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }
}
