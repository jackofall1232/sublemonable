// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.security.RootDetection
import com.sublemonable.app.tor.TorIntegration
import com.sublemonable.app.ui.components.NewChatDialog
import com.sublemonable.app.ui.screens.ChatListScreen
import com.sublemonable.app.ui.screens.ChatScreen
import com.sublemonable.app.ui.screens.KeyVerificationScreen
import com.sublemonable.app.ui.screens.LockScreen
import com.sublemonable.app.ui.screens.OnboardingScreen
import com.sublemonable.app.ui.screens.SettingsScreen
import com.sublemonable.app.ui.screens.SplashScreen
import com.sublemonable.app.ui.theme.Motion
import com.sublemonable.app.ui.theme.SublemonableTheme

/**
 * The single Activity. Extends FragmentActivity because BiometricPrompt
 * requires it.
 *
 * CRITICAL RULE: FLAG_SECURE is set in onCreate BEFORE setContent. This is
 * the OS-level hard block — screenshots and screen recordings of any screen
 * in this Activity render black. Every Activity that can ever show message
 * content must do exactly this; in this app, that's the only Activity there
 * is.
 */
class MainActivity : FragmentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Either way we proceed: notifications are content-free anyway.
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ── FLAG_SECURE before any content exists. Never remove. ──────────
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )

        val container = (application as SublemonableApp).container

        maybeRequestNotificationPermission()

        setContent {
            SublemonableTheme {
                SublemonableRoot(
                    container = container,
                    requestBiometric = ::showBiometricPrompt,
                )
            }
        }
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /**
     * Launches the biometric gate. Falls open (with no error) only when the
     * device has no secure lock at all — a gate that cannot exist can't be
     * required.
     */
    private fun showBiometricPrompt(onResult: (Boolean, String?) -> Unit) {
        val authenticators = BIOMETRIC_STRONG or DEVICE_CREDENTIAL
        when (BiometricManager.from(this).canAuthenticate(authenticators)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                val prompt = BiometricPrompt(
                    this,
                    ContextCompat.getMainExecutor(this),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(
                            result: BiometricPrompt.AuthenticationResult,
                        ) {
                            onResult(true, null)
                        }

                        override fun onAuthenticationError(
                            errorCode: Int,
                            errString: CharSequence,
                        ) {
                            onResult(false, errString.toString())
                        }

                        override fun onAuthenticationFailed() {
                            // Keep the prompt open; the user can retry.
                        }
                    },
                )
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(getString(R.string.biometric_title))
                    .setSubtitle(getString(R.string.biometric_subtitle))
                    .setAllowedAuthenticators(authenticators)
                    .build()
                prompt.authenticate(promptInfo)
            }
            else -> onResult(true, null)
        }
    }
}

// ---------------------------------------------------------------------------
// Navigation — hand-rolled single-stack routing, no nav dependency.
// ---------------------------------------------------------------------------

private sealed interface Route {
    data object Splash : Route
    data object Onboarding : Route
    data object Locked : Route
    data object ChatList : Route
    data class Chat(val conversationId: String) : Route
    data object Settings : Route
    data class Verify(val conversationId: String) : Route
}

@Composable
private fun SublemonableRoot(
    container: AppContainer,
    requestBiometric: ((Boolean, String?) -> Unit) -> Unit,
) {
    val context = LocalContext.current

    val settings by container.settingsRepository.settings.collectAsState()
    val conversations by container.conversationRepository.conversations.collectAsState()
    val allMessages by container.messageRepository.messages.collectAsState()
    val typingPeers by container.coordinator.typingPeers.collectAsState()
    val connectionState by container.wsClient.connectionState.collectAsState()

    var route by remember { mutableStateOf<Route>(Route.Splash) }
    var unlocked by remember { mutableStateOf(false) }
    var lockError by remember { mutableStateOf<String?>(null) }
    var showNewChatDialog by remember { mutableStateOf(false) }

    // Root detection: warn once per process, never block.
    var rootWarningVisible by remember {
        mutableStateOf(RootDetection.check(context).likelyRooted)
    }

    val unlock: () -> Unit = {
        requestBiometric { success, error ->
            if (success) {
                lockError = null
                unlocked = true
                route = Route.ChatList
            } else {
                lockError = error
            }
        }
    }

    // Boot the messaging stack only after the gate opens.
    LaunchedEffect(unlocked) {
        if (unlocked) container.coordinator.start()
    }

    // Server-side session revocation forces the gate shut again.
    DisposableEffect(Unit) {
        container.coordinator.onForcedLogout = {
            unlocked = false
            route = Route.Locked
        }
        onDispose { container.coordinator.onForcedLogout = null }
    }

    BackHandler(enabled = route !is Route.ChatList && unlocked) {
        route = when (val current = route) {
            is Route.Verify -> Route.Chat(current.conversationId)
            else -> Route.ChatList
        }
    }

    Crossfade(
        targetState = route,
        animationSpec = tween(Motion.DurationBaseMs, easing = Motion.EasingDefault),
        label = "rootNavigation",
    ) { current ->
        when (current) {
            Route.Splash -> SplashScreen(
                onFinished = {
                    route = when {
                        !settings.onboardingDone -> Route.Onboarding
                        settings.biometricRequired -> Route.Locked
                        else -> {
                            unlocked = true
                            Route.ChatList
                        }
                    }
                },
            )

            Route.Onboarding -> OnboardingScreen(
                onDone = {
                    container.settingsRepository.setOnboardingDone(true)
                    route = if (settings.biometricRequired) {
                        Route.Locked
                    } else {
                        unlocked = true
                        Route.ChatList
                    }
                },
            )

            Route.Locked -> {
                LockScreen(onUnlockRequest = unlock, errorMessage = lockError)
                LaunchedEffect(Unit) { unlock() }
            }

            Route.ChatList -> ChatListScreen(
                conversations = conversations,
                rootWarningVisible = rootWarningVisible,
                onDismissRootWarning = { rootWarningVisible = false },
                onOpenConversation = { route = Route.Chat(it.id) },
                onOpenSettings = { route = Route.Settings },
                onNewChat = { showNewChatDialog = true },
            )

            is Route.Chat -> {
                val conversation = conversations.firstOrNull { it.id == current.conversationId }
                if (conversation == null) {
                    // Conversation burned away beneath us.
                    LaunchedEffect(current) { route = Route.ChatList }
                } else {
                    LaunchedEffect(conversation.id) {
                        container.conversationRepository.markConversationRead(conversation.id)
                    }
                    ChatScreen(
                        conversation = conversation,
                        messages = allMessages[conversation.id].orEmpty(),
                        peerTyping = conversation.contactId in typingPeers,
                        defaultTtlSeconds = settings.defaultTtlSeconds,
                        defaultBurnOnRead = settings.burnOnReadDefault,
                        ttlOptions = container.settingsRepository.ttlOptionsSeconds,
                        onBack = { route = Route.ChatList },
                        onVerifyKeys = { route = Route.Verify(conversation.id) },
                        onBurnAll = { container.messageRepository.burnAll(conversation.id) },
                        onSend = { text, ttl, burn ->
                            container.coordinator.sendText(conversation, text, ttl, burn)
                        },
                        onMessageSeen = container.messageRepository::markRead,
                        onTyping = { started ->
                            container.coordinator.sendTyping(conversation, started)
                        },
                    )
                }
            }

            Route.Settings -> SettingsScreen(
                settingsRepository = container.settingsRepository,
                accountId = container.apiClient.accountId,
                identityFingerprint = remember {
                    runCatching {
                        container.signalManager.ensureIdentity()
                        container.signalManager.localFingerprint()
                    }.getOrDefault("")
                },
                connectionState = connectionState,
                torAvailable = remember { TorIntegration.isOrbotInstalled(context) },
                onBack = { route = Route.ChatList },
                onDeleteAccount = {
                    container.coordinator.deleteAccountAndWipe {
                        container.signalStore.wipe()
                        unlocked = false
                        route = Route.Splash
                    }
                },
            )

            is Route.Verify -> {
                val conversation = conversations.firstOrNull { it.id == current.conversationId }
                if (conversation == null) {
                    LaunchedEffect(current) { route = Route.ChatList }
                } else {
                    val safetyNumber = remember(conversation.contactIdentityKeyBase64) {
                        runCatching {
                            val contactKey = conversation.contactIdentityKeyBase64
                            if (contactKey != null) {
                                container.signalManager.safetyNumberWith(contactKey)
                            } else {
                                // No key exchanged yet — show our own
                                // fingerprint so verification can still start
                                // from the other side.
                                container.signalManager.localFingerprint()
                            }
                        }.getOrDefault("")
                    }
                    KeyVerificationScreen(
                        conversation = conversation,
                        safetyNumber = safetyNumber,
                        onBack = { route = Route.Chat(conversation.id) },
                        onMarkVerified = {
                            container.conversationRepository.setVerified(conversation.id, true)
                        },
                    )
                }
            }
        }
    }

    if (showNewChatDialog) {
        NewChatDialog(
            onDismiss = { showNewChatDialog = false },
            onAdd = { contactId, displayName ->
                showNewChatDialog = false
                val conversation = Conversation(
                    id = contactId,
                    contactId = contactId,
                    displayName = displayName,
                    lastActivityMs = System.currentTimeMillis(),
                )
                container.conversationRepository.upsert(conversation)
                route = Route.Chat(conversation.id)
            },
        )
    }
}
