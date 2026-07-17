// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// Settings per design_system.screens.settings: dark grouped list with lemon
/// accents, sections Security / Privacy / Account / Network / Appearance.
public struct SettingsView: View {
    @ObservedObject var orbot: OrbotIntegration
    @ObservedObject var diagnostics: BootDiagnostics
    public let localFingerprint: String
    public let connectionState: WebSocketClient.ConnectionState
    public var onDeleteAccount: () -> Void
    public var onDismiss: () -> Void

    // Privacy defaults applied to new messages (UI preferences, not secrets).
    @AppStorage("org.sublemonable.default-ttl") private var defaultTTL: Int = 0
    @AppStorage("org.sublemonable.default-burn-on-read") private var defaultBurnOnRead = false
    @AppStorage("org.sublemonable.biometric-lock") private var biometricLock = true

    // Notification sound: "" (or missing) = branded default, "custom" = user
    // file. Mirrors NotificationSoundStore.preferenceKey so the row reflects
    // changes immediately.
    @AppStorage(NotificationSoundStore.preferenceKey) private var notificationSound = ""
    @State private var showSoundImporter = false
    @State private var soundImportError: String?
    @State private var isImportingSound = false
    // Retained so preview playback isn't deallocated mid-sound.
    @State private var previewPlayer: AVAudioPlayer?

    @State private var showFingerprint = false
    @State private var confirmDelete = false
    // Populated in .task — JailbreakDetector.check() touches main-thread-only
    // API (UIApplication.canOpenURL) and must not run during view init.
    @State private var jailbreakResult = JailbreakDetector.Result(suspicious: false, reasons: [])

    public init(orbot: OrbotIntegration,
                diagnostics: BootDiagnostics,
                localFingerprint: String,
                connectionState: WebSocketClient.ConnectionState,
                onDeleteAccount: @escaping () -> Void,
                onDismiss: @escaping () -> Void) {
        self.orbot = orbot
        self.diagnostics = diagnostics
        self.localFingerprint = localFingerprint
        self.connectionState = connectionState
        self.onDeleteAccount = onDeleteAccount
        self.onDismiss = onDismiss
    }

    public var body: some View {
        NavigationStack {
            List {
                if jailbreakResult.suspicious {
                    jailbreakWarning
                }
                securitySection
                privacySection
                notificationsSection
                accountSection
                networkSection
                appearanceSection
            }
            .scrollContentBackground(.hidden)
            .background(Color.backgroundPrimary)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .task { @MainActor in
                jailbreakResult = JailbreakDetector.check()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done", action: onDismiss)
                        .foregroundColor(.lemon)
                }
            }
            .fileImporter(
                isPresented: $showSoundImporter,
                allowedContentTypes: [.audio],
                allowsMultipleSelection: false
            ) { result in
                handleSoundImport(result)
            }
            .alert(
                "Couldn't set that sound",
                isPresented: Binding(
                    get: { soundImportError != nil },
                    set: { if !$0 { soundImportError = nil } }
                )
            ) {
                Button("OK", role: .cancel) { soundImportError = nil }
            } message: {
                Text(soundImportError ?? "")
            }
        }
        .tint(.lemon)
        .confirmationDialog("Delete account?",
                            isPresented: $confirmDelete,
                            titleVisibility: .visible) {
            Button("Delete everything", role: .destructive, action: onDeleteAccount)
        } message: {
            Text("Purges all prekeys, pending messages, and the account record. Irreversible.")
        }
        .sheet(isPresented: $showFingerprint) {
            VStack(spacing: Spacing.s6) {
                Text("Your identity key")
                    .font(SubFont.display(TypeScale.xl, weight: .semibold))
                    .foregroundColor(.textPrimary)
                KeyFingerprintView(fingerprint: localFingerprint)
                Text("Generated on this device. It has never left it.")
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.textMuted)
            }
            .padding(Spacing.s6)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.backgroundSecondary.ignoresSafeArea())
            .presentationDetents([.medium])
        }
    }

    // MARK: Sections

    /// Warn only — never block (see JailbreakDetector).
    private var jailbreakWarning: some View {
        Section {
            HStack(spacing: Spacing.s3) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.burnOrange)
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    Text("This device looks jailbroken")
                        .font(SubFont.body(TypeScale.sm, weight: .medium))
                        .foregroundColor(.textPrimary)
                    Text(jailbreakResult.reasons.joined(separator: " · ")
                         + ". Local key protection may be weakened.")
                        .font(SubFont.body(TypeScale.xs))
                        .foregroundColor(.textSecondary)
                }
            }
            .listRowBackground(Color.backgroundElevated)
        }
    }

    private var securitySection: some View {
        Section("Security") {
            Toggle(isOn: $biometricLock) {
                settingLabel("Require Face ID / Touch ID", icon: "faceid")
            }
            Button { showFingerprint = true } label: {
                settingLabel("Key fingerprint", icon: "key.horizontal")
            }
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    private var privacySection: some View {
        Section("Privacy") {
            Picker(selection: $defaultTTL) {
                Text("Off").tag(0)
                ForEach(ComposeBar.ttlOptions, id: \.self) { option in
                    Text(ComposeBar.label(forTTL: option)).tag(option)
                }
            } label: {
                settingLabel("Default disappear timer", icon: "timer")
            }
            Toggle(isOn: $defaultBurnOnRead) {
                settingLabel("Burn on read by default", icon: "flame")
            }
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    private var notificationsSection: some View {
        Section {
            HStack {
                settingLabel("Notification sound", icon: "bell.badge")
                Spacer()
                Text(notificationSound == "custom" ? "Custom" : "Sublemonable")
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.textMuted)
            }

            Button {
                playPreview()
            } label: {
                settingLabel("Preview current sound", icon: "play.circle")
            }

            Button {
                showSoundImporter = true
            } label: {
                if isImportingSound {
                    HStack(spacing: Spacing.s3) {
                        ProgressView().tint(.lemon).frame(width: 24)
                        Text("Converting…")
                            .font(SubFont.body(TypeScale.base))
                            .foregroundColor(.textSecondary)
                    }
                } else {
                    settingLabel("Choose your own sound…", icon: "square.and.arrow.down")
                }
            }
            .disabled(isImportingSound)

            if notificationSound == "custom" {
                Button {
                    NotificationSoundStore.useDefault()
                } label: {
                    settingLabel("Reset to Sublemonable sound", icon: "arrow.uturn.backward")
                }
            }

            Text("Your file is converted to a short alert tone (max 30s) and "
                 + "stored only on this device. Content-free alerts are unaffected.")
                .font(SubFont.body(TypeScale.xs))
                .foregroundColor(.textMuted)
        } header: {
            Text("Notifications")
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    private var accountSection: some View {
        Section("Account") {
            Button { showFingerprint = true } label: {
                settingLabel("Identity key", icon: "person.badge.key")
            }
            Button(role: .destructive) { confirmDelete = true } label: {
                HStack(spacing: Spacing.s3) {
                    Image(systemName: "trash")
                        .foregroundColor(.burnRed)
                        .frame(width: 24)
                    Text("Delete account")
                        .font(SubFont.body(TypeScale.base))
                        .foregroundColor(.burnRed)
                }
            }
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    private var networkSection: some View {
        Section {
            Toggle(isOn: $orbot.torOptIn) {
                settingLabel("Route through Tor (Orbot)", icon: "network.badge.shield.half.filled")
            }
            .onChange(of: orbot.torOptIn) { enabled in
                if enabled { orbot.openOrbot() }
            }
            if orbot.torOptIn {
                Text(orbot.isOrbotInstalled
                     ? "Traffic routes through Tor while Orbot's VPN is running. Open Orbot to confirm it's connected."
                     : "Orbot isn't installed. Get it from the App Store, then start its VPN.")
                    .font(SubFont.body(TypeScale.xs))
                    .foregroundColor(.textMuted)
            }
            HStack {
                settingLabel("Connection", icon: "dot.radiowaves.left.and.right")
                Spacer()
                connectionStatus
            }
            // Privacy-safe stage log — how connection failures get diagnosed
            // on-device without a debugger (port of Android's Diagnostics).
            NavigationLink {
                DiagnosticsView(diagnostics: diagnostics)
            } label: {
                settingLabel("Connection diagnostics", icon: "waveform.path.ecg")
            }
        } header: {
            Text("Network")
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    private var appearanceSection: some View {
        Section("Appearance") {
            HStack {
                settingLabel("Theme", icon: "moon.fill")
                Spacer()
                Text("Dark — the only mode")
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.textMuted)
            }
        }
        .listRowBackground(Color.backgroundSecondary)
    }

    // MARK: Bits

    private var connectionStatus: some View {
        HStack(spacing: Spacing.s2) {
            switch connectionState {
            case .connected:
                Circle().fill(Color.successGreen).frame(width: 8, height: 8)
                Text("Connected")
                    .font(SubFont.mono(TypeScale.xs))
                    .foregroundColor(.textSecondary)
            case .connecting:
                LemonSliceView(variant: .loadingSpinner)
                    .frame(width: 14, height: 14)
                Text("Connecting")
                    .font(SubFont.mono(TypeScale.xs))
                    .foregroundColor(.textSecondary)
            case .disconnected:
                Circle().fill(Color.burnRed).frame(width: 8, height: 8)
                Text("Offline")
                    .font(SubFont.mono(TypeScale.xs))
                    .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: Notification sound handlers

    private func handleSoundImport(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let source = urls.first else {
            // A cancelled picker returns .failure or empty — not an error to show.
            return
        }
        isImportingSound = true
        // Transcode off the main thread (AVAssetReader/Writer + file I/O).
        DispatchQueue.global(qos: .userInitiated).async {
            let outcome = NotificationSoundStore.importCustomSound(from: source)
            DispatchQueue.main.async {
                isImportingSound = false
                switch outcome {
                case .success:
                    // @AppStorage picks up the "custom" flag written by the store.
                    playPreview()
                case let .failure(error):
                    soundImportError = error.errorDescription
                }
            }
        }
    }

    private func playPreview() {
        guard let url = NotificationSoundStore.previewURL() else { return }
        do {
            // Respect the silent switch is NOT desired for a preview — use
            // playback so the user actually hears their pick even on silent.
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let player = try AVAudioPlayer(contentsOf: url)
            previewPlayer = player
            player.play()
        } catch {
            // Preview is best-effort; never surface a playback failure as an error.
        }
    }

    private func settingLabel(_ title: String, icon: String) -> some View {
        HStack(spacing: Spacing.s3) {
            Image(systemName: icon)
                .foregroundColor(.lemon)
                .frame(width: 24)
            Text(title)
                .font(SubFont.body(TypeScale.base))
                .foregroundColor(.textPrimary)
        }
    }
}
