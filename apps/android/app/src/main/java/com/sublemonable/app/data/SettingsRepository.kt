// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.data

import com.sublemonable.app.crypto.KeyStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * User preferences, persisted via EncryptedSharedPreferences only.
 * All defaults follow the master spec: Tor OFF (opt-in), biometric gate ON,
 * burn-on-read OFF, no default TTL.
 */
class SettingsRepository(keyStoreManager: KeyStoreManager) {

    private val prefs = keyStoreManager.prefs(KeyStoreManager.PREFS_SETTINGS)

    data class Settings(
        val onboardingDone: Boolean = false,
        val biometricRequired: Boolean = true,
        /** features.messaging.disappearing_messages.options_seconds; null = off. */
        val defaultTtlSeconds: Int? = null,
        val burnOnReadDefault: Boolean = false,
        /** Read receipts are user-controlled (features.messaging.read_receipts). */
        val readReceipts: Boolean = true,
        /** Tor via Orbot — strictly opt-in (security.transport.tor). */
        val torEnabled: Boolean = false,
    )

    private val _settings = MutableStateFlow(load())
    val settings: StateFlow<Settings> = _settings.asStateFlow()

    /** TTL choices from features.messaging.disappearing_messages. */
    val ttlOptionsSeconds: List<Int?> = listOf(null, 30, 60, 300, 3600, 86400, 604800)

    fun setOnboardingDone(done: Boolean) = put { putBoolean(KEY_ONBOARDING, done) }

    fun setBiometricRequired(required: Boolean) = put { putBoolean(KEY_BIOMETRIC, required) }

    fun setDefaultTtlSeconds(seconds: Int?) = put { putInt(KEY_TTL, seconds ?: TTL_OFF) }

    fun setBurnOnReadDefault(enabled: Boolean) = put { putBoolean(KEY_BURN_ON_READ, enabled) }

    fun setReadReceipts(enabled: Boolean) = put { putBoolean(KEY_READ_RECEIPTS, enabled) }

    fun setTorEnabled(enabled: Boolean) = put { putBoolean(KEY_TOR, enabled) }

    private fun put(edit: android.content.SharedPreferences.Editor.() -> Unit) {
        prefs.edit().apply(edit).apply()
        _settings.value = load()
    }

    private fun load(): Settings = Settings(
        onboardingDone = prefs.getBoolean(KEY_ONBOARDING, false),
        biometricRequired = prefs.getBoolean(KEY_BIOMETRIC, true),
        defaultTtlSeconds = prefs.getInt(KEY_TTL, TTL_OFF).takeIf { it != TTL_OFF },
        burnOnReadDefault = prefs.getBoolean(KEY_BURN_ON_READ, false),
        readReceipts = prefs.getBoolean(KEY_READ_RECEIPTS, true),
        torEnabled = prefs.getBoolean(KEY_TOR, false),
    )

    companion object {
        private const val TTL_OFF = -1
        private const val KEY_ONBOARDING = "onboarding_done"
        private const val KEY_BIOMETRIC = "biometric_required"
        private const val KEY_TTL = "default_ttl_seconds"
        private const val KEY_BURN_ON_READ = "burn_on_read_default"
        private const val KEY_READ_RECEIPTS = "read_receipts"
        private const val KEY_TOR = "tor_enabled"
    }
}
