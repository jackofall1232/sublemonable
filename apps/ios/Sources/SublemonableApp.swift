// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI
import UIKit
import LocalAuthentication

/// App entry. Flow: Splash → (Onboarding on first run) → Biometric unlock
/// gate → ChatList. The CaptureShieldOverlay sits at the root with the
/// highest zIndex so the blur covers EVERYTHING the moment recording starts
/// or the app resigns active.
@main
struct SublemonableApp: App {
    @StateObject private var environment = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                    .environmentObject(environment)
                CaptureShieldOverlay(detector: environment.capture)
                    .zIndex(.greatestFiniteMagnitude)
            }
            .preferredColorScheme(.dark) // Dark only — no light mode in v1.
            .background(Color.backgroundPrimary)
        }
    }
}

// MARK: - Composition root

@MainActor
final class AppEnvironment: ObservableObject {
    enum Phase: Equatable {
        case splash
        case onboarding
        case locked
        case unlocking
        case ready
    }

    @Published var phase: Phase = .splash
    @Published var activeConversation: Conversation?
    @Published var showSettings = false
    @Published var showAddContact = false
    @Published var verifyingContact: Contact?
    @Published var connectionState: WebSocketClient.ConnectionState = .disconnected
    @Published var unlockFailed = false

    let keychain: KeychainStore
    let signal: SignalManager
    let api: APIClient
    let socket: WebSocketClient
    let conversations: ConversationStore
    let messages: MessageStore
    let capture: CaptureDetector
    let orbot: OrbotIntegration
    let diagnostics: BootDiagnostics

    @AppStorage("org.sublemonable.onboarded") private var onboarded = false
    @AppStorage("org.sublemonable.biometric-lock") private var biometricLock = true

    init() {
        let keychain = KeychainStore.shared
        let signal = SignalManager(keychain: keychain)
        let api = APIClient(keychain: keychain)
        let socket = WebSocketClient()
        let conversations = ConversationStore()
        let messages = MessageStore(signal: signal,
                                    socket: socket,
                                    conversations: conversations)
        self.keychain = keychain
        self.signal = signal
        self.api = api
        self.socket = socket
        self.conversations = conversations
        self.messages = messages
        self.capture = CaptureDetector()
        self.orbot = OrbotIntegration.shared
        self.diagnostics = BootDiagnostics()

        wire()
    }

    private func wire() {
        NotificationManager.shared.configure()

        // Crypto ↔ network wiring without circular imports.
        signal.bundleFetcher = { [api] contactID in
            try await api.fetchPreKeyBundle(for: contactID)
        }
        Task { [api, signal] in
            await api.setLoginSigner { accountID, timestamp in
                try signal.loginSignature(accountID: accountID, unixTimestamp: timestamp)
            }
        }
        socket.setAccessTokenProvider { [api] in
            await api.currentAccessToken()
        }
        // Socket lifecycle + boot + send stages share the one privacy-safe
        // log (Settings → Connection diagnostics).
        socket.diag = { [diagnostics] line in diagnostics.record(line) }
        messages.diag = { [diagnostics] line in diagnostics.record(line) }
        socket.onStateChange = { [weak self] state in
            Task { @MainActor in self?.connectionState = state }
        }
        socket.onPreKeyLow = { [weak self] in
            Task { await self?.replenishPreKeys() }
        }
        socket.onSessionRevoked = { [weak self] in
            Task { @MainActor in self?.phase = .locked }
        }
        // Handshake rejected the JWT (they live 15 min): mint a fresh session
        // and reconnect, instead of the socket reconnect-looping on a dead
        // token forever — the Android coordinator's onAuthExpired behavior.
        socket.onAuthExpired = { [weak self] in
            Task { await self?.reauthenticateAndReconnect() }
        }
        // Content-free notification when a message lands while backgrounded.
        messages.onInboundMessage = {
            if UIApplication.shared.applicationState != .active {
                NotificationManager.shared.postNewMessageNotification()
            }
        }
    }

    // MARK: Flow

    func splashFinished() {
        phase = onboarded ? .locked : .onboarding
    }

    func onboardingFinished() {
        onboarded = true
        phase = .locked
    }

    /// Biometric unlock gate (Face ID / Touch ID, passcode fallback).
    func unlock() {
        guard phase == .locked else { return }
        phase = .unlocking
        unlockFailed = false

        guard biometricLock else {
            Task { await startSession() }
            return
        }

        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        var error: NSError?
        let policy: LAPolicy = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics, error: &error)
            ? .deviceOwnerAuthenticationWithBiometrics
            : .deviceOwnerAuthentication

        context.evaluatePolicy(policy,
                               localizedReason: "Unlock your encrypted messages") { [weak self] success, _ in
            Task { @MainActor in
                guard let self else { return }
                if success {
                    await self.startSession()
                } else {
                    self.unlockFailed = true
                    self.phase = .locked
                }
            }
        }
    }

    /// First run: generate identity + keys, register. Every run: login with
    /// the signed challenge, connect the socket, rotate the signed prekey if
    /// it is older than 7 days.
    ///
    /// Boot stages report to the diagnostics log (Settings → Connection
    /// diagnostics): fixed stage strings + error type/code only, never keys,
    /// tokens, ids, or URLs — the same discipline that made Android's
    /// silent-boot failures diagnosable on-device (PR #19/#20 lineage).
    private func startSession() async {
        phase = .ready
        var stage = "ensure-identity"
        do {
            if !signal.isRegistered {
                let registrationKeys = try signal.bootstrapIdentity()
                stage = "register"
                diagnostics.record("boot: firing POST /api/v1/register")
                let accountID = try await api.register(keys: registrationKeys)
                try signal.setAccountID(accountID)
                diagnostics.record("boot: registration accepted by server")
            }
            guard let accountID = signal.accountID else { return }
            stage = "create-session"
            try await api.login(accountID: accountID)
            stage = "ws-connect"
            diagnostics.record("boot: session minted, socket handshake handed off")
            socket.connect()
            _ = await NotificationManager.shared.requestAuthorization()

            stage = "rotate-signed-prekey"
            if let rotated = try signal.rotateSignedPreKeyIfNeeded() {
                try await api.uploadPreKeys([], signedPreKey: rotated)
            }
        } catch {
            // Offline / unreachable server: the UI still works; the socket
            // reconnect loop and the next unlock retry the session. The
            // diagnostics line carries the stage + error type/code only —
            // never full error strings, which can embed URLs/identifiers.
            diagnostics.record("boot: failed at stage=\(stage): \(BootDiagnostics.describe(error))")
            connectionState = .disconnected
        }
    }

    /// The WS handshake was rejected with 401/403 — the access token is dead
    /// (15-minute JWTs). Mint a fresh session, then reconnect the socket.
    private func reauthenticateAndReconnect() async {
        guard let accountID = signal.accountID else { return }
        do {
            do {
                try await api.refreshSession()
            } catch {
                // Refresh token consumed/expired — full login re-challenge.
                try await api.login(accountID: accountID)
            }
            diagnostics.record("boot: session re-minted after ws auth expiry")
            socket.connect()
        } catch {
            diagnostics.record("boot: re-auth failed: \(BootDiagnostics.describe(error))")
            connectionState = .disconnected
        }
    }

    private func replenishPreKeys() async {
        guard let batch = try? signal.generateOneTimePreKeys() else { return }
        try? await api.uploadPreKeys(batch)
    }

    func deleteAccount() {
        Task {
            try? await api.deleteAccount()
            socket.disconnect()
            messages.wipeAll()
            try? signal.wipe()
            showSettings = false
            onboarded = false
            phase = .onboarding
        }
    }
}

// MARK: - Root view

struct RootView: View {
    @EnvironmentObject var environment: AppEnvironment

    var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()
            switch environment.phase {
            case .splash:
                SplashView { environment.splashFinished() }
            case .onboarding:
                OnboardingView { environment.onboardingFinished() }
            case .locked, .unlocking:
                LockView()
            case .ready:
                mainStack
            }
        }
    }

    @ViewBuilder
    private var mainStack: some View {
        ZStack {
            ChatListView(
                conversations: environment.conversations,
                onOpenConversation: { conversation in
                    environment.conversations.clearUnread(contactID: conversation.id)
                    environment.activeConversation = conversation
                },
                onOpenSettings: { environment.showSettings = true },
                onCompose: { environment.showAddContact = true }
            )

            if let conversation = environment.activeConversation,
               let live = environment.conversations.conversation(for: conversation.id) {
                ChatView(
                    conversation: live,
                    messageStore: environment.messages,
                    onBack: { environment.activeConversation = nil },
                    onVerifyKeys: { environment.verifyingContact = live.contact }
                )
                .transition(.move(edge: .trailing))
            }
        }
        .animation(Motion.easeDefault(), value: environment.activeConversation?.id)
        .sheet(isPresented: $environment.showSettings) {
            SettingsView(
                orbot: environment.orbot,
                diagnostics: environment.diagnostics,
                localFingerprint: (try? environment.signal.localFingerprint()) ?? "—",
                connectionState: environment.connectionState,
                onDeleteAccount: { environment.deleteAccount() },
                onDismiss: { environment.showSettings = false }
            )
        }
        .sheet(isPresented: $environment.showAddContact) {
            AddContactSheet()
        }
        .sheet(item: $environment.verifyingContact) { contact in
            KeyVerificationView(
                contact: contact,
                safetyNumber: (try? environment.signal.safetyNumber(with: contact)) ?? "—",
                onMarkVerified: {
                    environment.conversations.markVerified(contact.id)
                    environment.verifyingContact = nil
                },
                onDismiss: { environment.verifyingContact = nil }
            )
        }
    }
}

// MARK: - Lock screen

/// Biometric gate: app_unlock — the lemon slice "opens like an iris" on
/// success and reveals the chat list.
struct LockView: View {
    @EnvironmentObject var environment: AppEnvironment

    var body: some View {
        VStack(spacing: Spacing.s7) {
            Spacer()
            LemonSliceView(variant: .logoMark)
                .frame(width: 96, height: 96)
                .lemonPulse()
            Text("Locked")
                .font(SubFont.display(TypeScale.xxl, weight: .semibold))
                .foregroundColor(.textPrimary)
            if environment.unlockFailed {
                Text("Couldn't verify it's you. Try again.")
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.burnOrange)
            }
            Spacer()
            if environment.phase == .unlocking {
                LemonSliceView(variant: .loadingSpinner)
                    .frame(width: 32, height: 32)
                    .padding(.bottom, Spacing.s9)
            } else {
                Button { environment.unlock() } label: {
                    Label("Unlock", systemImage: "faceid")
                        .font(SubFont.body(TypeScale.base, weight: .medium))
                        .foregroundColor(.textOnLemon)
                        .padding(.horizontal, Spacing.s8)
                        .padding(.vertical, Spacing.s4)
                        .background(Capsule().fill(Color.lemon))
                }
                .buttonStyle(LemonSpringButtonStyle())
                .padding(.bottom, Spacing.s9)
            }
        }
        .frame(maxWidth: .infinity)
        .background(Color.backgroundPrimary.ignoresSafeArea())
        .onAppear { environment.unlock() }
    }
}

// MARK: - Contact exchange (QR / link — no phone number, no email, no name)

struct AddContactSheet: View {
    @EnvironmentObject var environment: AppEnvironment
    @State private var pastedPayload = ""
    @State private var displayName = ""
    @State private var addFailed = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.s6) {
                Text("Add contact")
                    .font(SubFont.display(TypeScale.xl, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .padding(.top, Spacing.s6)

                if let payload = try? environment.signal.contactExchangePayload() {
                    FingerprintQRCode(payload: payload)
                    Text("Have them scan this — or send it as a link.\nIt contains only your routing ID and public key.")
                        .font(SubFont.body(TypeScale.sm))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                }

                VStack(alignment: .leading, spacing: Spacing.s3) {
                    Text("Or paste theirs")
                        .font(SubFont.body(TypeScale.sm, weight: .medium))
                        .foregroundColor(.textSecondary)
                    TextField("", text: $pastedPayload, axis: .vertical)
                        .font(SubFont.mono(TypeScale.xs))
                        .foregroundColor(.textPrimary)
                        .tint(.lemon)
                        .lineLimit(3...5)
                        .padding(Spacing.s3)
                        .background(RoundedRectangle(cornerRadius: Radius.md)
                            .fill(Color.backgroundElevated))
                    TextField("", text: $displayName)
                        .font(SubFont.body(TypeScale.base))
                        .foregroundColor(.textPrimary)
                        .tint(.lemon)
                        .padding(Spacing.s3)
                        .background(RoundedRectangle(cornerRadius: Radius.md)
                            .fill(Color.backgroundElevated))
                        .overlay(alignment: .leading) {
                            if displayName.isEmpty {
                                Text("Name them (stays on your device)")
                                    .font(SubFont.body(TypeScale.base))
                                    .foregroundColor(.textMuted)
                                    .padding(.horizontal, Spacing.s3)
                                    .allowsHitTesting(false)
                            }
                        }
                    if addFailed {
                        Text("That doesn't look like a Sublemonable contact code.")
                            .font(SubFont.body(TypeScale.xs))
                            .foregroundColor(.burnRed)
                    }
                    Button {
                        let name = displayName.isEmpty ? "Contact" : displayName
                        if environment.conversations.addContact(
                            fromQRPayload: pastedPayload, displayName: name) != nil {
                            environment.showAddContact = false
                        } else {
                            addFailed = true
                        }
                    } label: {
                        Text("Add contact")
                            .font(SubFont.body(TypeScale.base, weight: .medium))
                            .foregroundColor(.textOnLemon)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.s4)
                            .background(Capsule().fill(Color.lemon))
                    }
                    .buttonStyle(LemonSpringButtonStyle())
                    .disabled(pastedPayload.isEmpty)
                    .opacity(pastedPayload.isEmpty ? 0.45 : 1)
                }
                .padding(.horizontal, Spacing.s6)
            }
            .padding(.bottom, Spacing.s8)
        }
        .background(Color.backgroundSecondary)
        .presentationDetents([.large])
    }
}
