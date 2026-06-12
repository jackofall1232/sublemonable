// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import Combine

/// Publishes a "shield state" assembled from three sources:
///
/// 1. UIScreen.capturedDidChangeNotification — screen recording / mirroring.
///    The shield raises IMMEDIATELY and stays up while capture is active.
/// 2. UIApplication.userDidTakeScreenshotNotification — fires AFTER the
///    screenshot is taken (it cannot be prevented on iOS); we show a warning
///    banner and record the event locally only. The event log never leaves
///    the device — there is no telemetry of any kind in this app.
/// 3. willResignActive / didBecomeActive — blur before the system snapshots
///    the app for the app switcher; unblur on return.
@MainActor
public final class CaptureDetector: ObservableObject {
    public enum ShieldReason: Equatable {
        case screenRecording
        case backgrounded
    }

    /// True whenever message content must be hidden behind the blur shield.
    @Published public private(set) var shieldActive = false
    @Published public private(set) var shieldReason: ShieldReason = .backgrounded
    @Published public var screenshotBannerVisible = false
    /// Local-only screenshot event log (timestamps, nothing else).
    @Published public private(set) var screenshotEvents: [Date] = []

    private var cancellables: Set<AnyCancellable> = []
    private var bannerDismissTask: Task<Void, Never>?

    public init(notificationCenter: NotificationCenter = .default) {
        // 1. Screen recording — real-time, immediate.
        notificationCenter.publisher(for: UIScreen.capturedDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshRecordingState() }
            .store(in: &cancellables)

        // 2. Screenshot — after the fact; warn + log locally.
        notificationCenter.publisher(for: UIApplication.userDidTakeScreenshotNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.handleScreenshot() }
            .store(in: &cancellables)

        // 3. Background blur.
        notificationCenter.publisher(for: UIApplication.willResignActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.raiseShield(.backgrounded) }
            .store(in: &cancellables)

        notificationCenter.publisher(for: UIApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshRecordingState() }
            .store(in: &cancellables)

        // Mirroring may already be active at launch.
        refreshRecordingState()
    }

    private func refreshRecordingState() {
        if UIScreen.main.isCaptured {
            raiseShield(.screenRecording)
        } else {
            shieldActive = false
        }
    }

    private func raiseShield(_ reason: ShieldReason) {
        shieldReason = reason
        shieldActive = true
    }

    private func handleScreenshot() {
        screenshotEvents.append(Date())
        screenshotBannerVisible = true
        bannerDismissTask?.cancel()
        bannerDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            self?.screenshotBannerVisible = false
        }
    }
}
