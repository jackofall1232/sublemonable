// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Full-screen protective shield driven by CaptureDetector.
///
/// - Screen recording (UIScreen.isCaptured): blur overlays IMMEDIATELY and in
///   real time while capture is active.
/// - App backgrounding (willResignActive): blur so the app switcher snapshot
///   never contains message content; removed on didBecomeActive.
/// - Screenshot (after the fact, cannot be prevented): a warning banner.
///
/// CRITICAL RULE: the blur must be jarring and instant — 120ms max.
public struct CaptureShieldOverlay: View {
    @ObservedObject var detector: CaptureDetector

    public init(detector: CaptureDetector) {
        self.detector = detector
    }

    public var body: some View {
        ZStack(alignment: .top) {
            if detector.shieldActive {
                shield
                    .transition(.opacity)
                    .zIndex(1)
            }
            if detector.screenshotBannerVisible {
                screenshotBanner
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(2)
            }
        }
        // duration_fast = 120ms — the protective ceiling.
        .animation(.linear(duration: Motion.fast), value: detector.shieldActive)
        .animation(Motion.easeDefault(Motion.base), value: detector.screenshotBannerVisible)
        .allowsHitTesting(detector.shieldActive)
        .ignoresSafeArea()
    }

    private var shield: some View {
        ZStack {
            // Material blur over everything; content layout stays hidden.
            Rectangle()
                .fill(.ultraThinMaterial)
            Color.backgroundPrimary.opacity(0.6)
            VStack(spacing: Spacing.s4) {
                LemonSliceView(variant: .logoMark)
                    .frame(width: 72, height: 72)
                Text(detector.shieldReason == .screenRecording
                     ? "Screen recording detected"
                     : "Protected")
                    .font(SubFont.display(TypeScale.lg, weight: .semibold))
                    .foregroundColor(.textPrimary)
                Text("Messages are hidden while the screen can be captured.")
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.s8)
            }
        }
    }

    private var screenshotBanner: some View {
        HStack(spacing: Spacing.s3) {
            LemonSliceView(variant: .logoMark)
                .frame(width: 20, height: 20)
            Text("Screenshot taken. The other side can do this too.")
                .font(SubFont.body(TypeScale.sm, weight: .medium))
                .foregroundColor(.textOnLemon)
            Spacer(minLength: 0)
        }
        .padding(Spacing.s4)
        .background(RoundedRectangle(cornerRadius: Radius.md).fill(Color.lemon))
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s10)
    }
}
