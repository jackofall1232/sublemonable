// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import android.app.Application
import com.sublemonable.app.crypto.EncryptedSignalProtocolStore
import com.sublemonable.app.crypto.KeyStoreManager
import com.sublemonable.app.crypto.SignalProtocolManager
import com.sublemonable.app.data.ConversationRepository
import com.sublemonable.app.data.MessageRepository
import com.sublemonable.app.data.SettingsRepository
import com.sublemonable.app.diagnostics.BootDiagnostics
import com.sublemonable.app.net.ApiClient
import com.sublemonable.app.net.CertificatePinning
import com.sublemonable.app.net.WsClient
import com.sublemonable.app.notifications.MessagingNotifications
import com.sublemonable.app.tor.TorIntegration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Application entry point. No analytics, no crash reporting, no telemetry —
 * the only thing initialized here is the dependency graph and the
 * content-free notification channel.
 */
class SublemonableApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        MessagingNotifications.ensureChannel(this)
    }
}

/**
 * Hand-rolled dependency container — deliberately no DI framework, so the
 * complete object graph of a privacy-critical app stays auditable in one file.
 */
class AppContainer(private val app: Application) {

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val keyStoreManager = KeyStoreManager(app)
    val settingsRepository = SettingsRepository(keyStoreManager)
    val signalStore = EncryptedSignalProtocolStore(keyStoreManager)
    val signalManager = SignalProtocolManager(signalStore, keyStoreManager)

    private var httpClient =
        CertificatePinning.buildClient(torEnabled = settingsRepository.settings.value.torEnabled)

    val apiClient = ApiClient(API_BASE_URL, httpClient, keyStoreManager)
    val wsClient = WsClient(WS_URL, httpClient, scope)

    val messageRepository = MessageRepository(scope)
    val conversationRepository = ConversationRepository()

    /** On-device, adb-free boot diagnostics (Settings → Diagnostics). */
    val bootDiagnostics = BootDiagnostics(app)

    val coordinator = MessagingCoordinator(
        appContext = app,
        scope = scope,
        signal = signalManager,
        api = apiClient,
        ws = wsClient,
        messages = messageRepository,
        conversations = conversationRepository,
        diagnostics = bootDiagnostics,
    )

    init {
        // Rebuild the transport whenever the Tor toggle changes (opt-in).
        scope.launch {
            settingsRepository.settings
                .map { it.torEnabled }
                .distinctUntilChanged()
                .drop(1) // initial value already applied above
                .collect { torEnabled -> applyTorSetting(torEnabled) }
        }
    }

    private fun applyTorSetting(torEnabled: Boolean) {
        if (torEnabled) {
            TorIntegration.requestOrbotStart(app)
        }
        httpClient = CertificatePinning.buildClient(torEnabled)
        apiClient.updateClient(httpClient)
        wsClient.updateClient(httpClient)
        // Reconnect over the new transport.
        wsClient.disconnect()
        apiClient.accessToken?.let(wsClient::connect)
    }

    companion object {
        // Self-hosters: point these at your deployment AND replace the
        // certificate pin in net/CertificatePinning.kt.
        const val API_BASE_URL = "https://relay.sublemonable.com"
        const val WS_URL = "wss://relay.sublemonable.com/ws"
    }
}
