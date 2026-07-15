// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.sublemonable.app.MessagingCoordinator
import com.sublemonable.app.data.SettingsRepository
import com.sublemonable.app.data.TransportState
import com.sublemonable.app.tor.TorIntegration
import com.sublemonable.app.ui.components.KeyFingerprintDisplay
import com.sublemonable.app.ui.components.LemonSliceSecurity
import com.sublemonable.app.ui.components.ttlLabel
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.ErrorRed
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.Rind
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary
import com.sublemonable.app.ui.theme.TypeScale
import com.sublemonable.app.ui.theme.VerifiedGreen

/**
 * Settings (design_system.screens.settings): dark grouped list with lemon
 * accents. Sections — Security, Privacy, Account, Network, Appearance.
 */
@Composable
fun SettingsScreen(
    settingsRepository: SettingsRepository,
    accountId: String?,
    identityFingerprint: String,
    connectivity: MessagingCoordinator.Connectivity,
    torAvailable: Boolean,
    onBack: () -> Unit,
    onDeleteAccount: () -> Unit,
    onOpenDiagnostics: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val settings by settingsRepository.settings.collectAsState()
    val context = LocalContext.current

    // Live transport, derived only from facts we actually hold. I2P is never
    // emitted on mobile (no in-process router SDK — see ConnectionMode.kt); the
    // real universe here is Tor-over-Orbot or clearnet. Clearnet is always
    // flagged per the locked I2P -> Tor -> clearnet hierarchy.
    val transport = when (connectivity) {
        MessagingCoordinator.Connectivity.ONLINE ->
            if (settings.torEnabled && torAvailable) TransportState.TOR else TransportState.CLEARNET_FALLBACK
        MessagingCoordinator.Connectivity.CONNECTING -> null
        MessagingCoordinator.Connectivity.OFFLINE -> TransportState.OFFLINE
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
                text = "Settings",
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
            )
        }

        // ----- Security ------------------------------------------------------
        SectionHeader("Security")
        ToggleRow(
            title = "Biometric unlock",
            subtitle = "Require fingerprint or face before showing chats",
            checked = settings.biometricRequired,
            onToggle = settingsRepository::setBiometricRequired,
        )
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(
                text = "Your identity key fingerprint",
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
            )
            Text(
                text = "Contacts can compare this against what their device shows for you.",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            KeyFingerprintDisplay(fingerprint = identityFingerprint)
        }

        // ----- Privacy -------------------------------------------------------
        SectionHeader("Privacy")
        ClickableRow(
            title = "Default disappearing timer",
            subtitle = "Applied to new messages: ${ttlLabel(settings.defaultTtlSeconds)}",
            trailing = {
                Text(
                    text = ttlLabel(settings.defaultTtlSeconds),
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Sm,
                    color = Lemon,
                )
            },
            onClick = {
                val options = settingsRepository.ttlOptionsSeconds
                val next = (options.indexOf(settings.defaultTtlSeconds) + 1) % options.size
                settingsRepository.setDefaultTtlSeconds(options[next])
            },
        )
        ToggleRow(
            title = "Burn on read by default",
            subtitle = "New messages destroy themselves after the first open",
            checked = settings.burnOnReadDefault,
            onToggle = settingsRepository::setBurnOnReadDefault,
        )
        ToggleRow(
            title = "Send read receipts",
            subtitle = "Encrypted signal — the server never knows read status",
            checked = settings.readReceipts,
            onToggle = settingsRepository::setReadReceipts,
        )

        // ----- Account -------------------------------------------------------
        SectionHeader("Account")
        ClickableRow(
            title = "Account ID",
            // Registration happens automatically at first launch. If it hasn't
            // landed yet, say why instead of a dead-end "Not registered yet".
            subtitle = accountId ?: when (connectivity) {
                MessagingCoordinator.Connectivity.CONNECTING -> "Setting up your encrypted identity…"
                else -> "Not registered yet — waiting for a connection to the relay"
            },
            subtitleMono = accountId != null,
            onClick = {},
        )
        ClickableRow(
            title = "Delete account",
            subtitle = "Purges every key, prekey and pending envelope. Irreversible.",
            titleColor = ErrorRed,
            onClick = onDeleteAccount,
        )

        // ----- Network -------------------------------------------------------
        SectionHeader("Network")
        ToggleRow(
            title = "Route through Tor",
            subtitle = if (torAvailable) {
                "Uses Orbot's local SOCKS proxy. Slower, more private."
            } else {
                "Requires Orbot — install it first, then enable this."
            },
            checked = settings.torEnabled,
            enabled = torAvailable,
            onToggle = settingsRepository::setTorEnabled,
        )
        // When Orbot is missing, give an actual way to get it (Issue: the
        // toggle said "install it first" but offered no path). Play Store first,
        // F-Droid as an explicit second option — our audience skews F-Droid.
        if (!torAvailable) {
            ClickableRow(
                title = "Get Orbot",
                subtitle = "Install the Tor proxy app, then come back and enable Tor.",
                titleColor = Lemon,
                onClick = { openOrbotInstall(context) },
            )
            ClickableRow(
                title = "…or get Orbot on F-Droid",
                subtitle = TorIntegration.ORBOT_FDROID_URL,
                subtitleMono = true,
                onClick = { context.startActivitySafely(TorIntegration.orbotFDroidIntent()) },
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Connection",
                    style = MaterialTheme.typography.titleSmall,
                    color = TextPrimary,
                )
                Text(
                    text = when (transport) {
                        TransportState.I2P -> "Connected via I2P — end-to-end encrypted"
                        TransportState.TOR -> "Connected via Tor — end-to-end encrypted"
                        TransportState.CLEARNET_FALLBACK -> "Connected over clearnet"
                        TransportState.OFFLINE -> "Offline"
                        null -> "Connecting…"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = when (transport) {
                        TransportState.I2P, TransportState.TOR -> VerifiedGreen
                        TransportState.CLEARNET_FALLBACK -> BurnOrange
                        TransportState.OFFLINE -> TextMuted
                        null -> Lemon
                    },
                )
                // Clearnet is always warned (docs/…/transport.ts CLEARNET_WARNING):
                // still E2E-encrypted, but the IP address may be visible.
                if (transport == TransportState.CLEARNET_FALLBACK) {
                    Text(
                        text = "Still end-to-end encrypted, but your IP may be visible. " +
                            "Enable Tor above for full anonymity.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                    )
                }
            }
            LemonSliceSecurity(
                level = when (transport) {
                    TransportState.I2P, TransportState.TOR -> 8
                    TransportState.CLEARNET_FALLBACK -> 6
                    TransportState.OFFLINE -> 0
                    null -> 4
                },
                verified = transport == TransportState.TOR || transport == TransportState.I2P,
            )
        }

        // ----- Diagnostics ---------------------------------------------------
        SectionHeader("Diagnostics")
        ClickableRow(
            title = "Connection diagnostics",
            // The self-serve answer to "it just says Connecting…": an on-device,
            // adb-free log of every registration/connection attempt.
            subtitle = "On-device log of registration & connection attempts. " +
                "Open it if you're stuck on “Connecting…”, and share it in a bug report.",
            onClick = onOpenDiagnostics,
        )

        // ----- Appearance ----------------------------------------------------
        SectionHeader("Appearance")
        ClickableRow(
            title = "Theme",
            subtitle = "Dark. There is no light mode — lemons grow in the dark here.",
            trailing = {
                Text(
                    text = "Dark",
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Sm,
                    color = TextSecondary,
                )
            },
            onClick = {},
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
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
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(BackgroundElevated)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleSmall, color = TextPrimary)
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        }
        // Lemon accents on active toggles — never blue.
        Switch(
            checked = checked,
            onCheckedChange = onToggle,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = TextOnLemon,
                checkedTrackColor = Lemon,
                uncheckedThumbColor = TextSecondary,
                uncheckedTrackColor = Rind,
                uncheckedBorderColor = BorderColor,
            ),
        )
    }
}

@Composable
private fun ClickableRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    titleColor: androidx.compose.ui.graphics.Color = TextPrimary,
    subtitleMono: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(BackgroundElevated)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleSmall, color = titleColor)
            if (subtitleMono) {
                Text(
                    text = subtitle,
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Xs,
                    color = TextMuted,
                )
            } else {
                Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = TextMuted)
            }
        }
        trailing?.invoke()
    }
}

/**
 * Opens Orbot's install page. Tries the Play Store first; on a device with no
 * store app (e.g. de-Googled), falls back to the F-Droid listing in a browser.
 * Never throws — a missing handler is a no-op, not a crash.
 */
private fun openOrbotInstall(context: Context) {
    if (!context.startActivitySafely(TorIntegration.orbotInstallIntent())) {
        context.startActivitySafely(TorIntegration.orbotFDroidIntent())
    }
}

/** startActivity guarded against ActivityNotFoundException. Returns success. */
private fun Context.startActivitySafely(intent: android.content.Intent): Boolean = try {
    startActivity(intent)
    true
} catch (e: ActivityNotFoundException) {
    false
}
