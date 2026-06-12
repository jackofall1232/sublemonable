// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Splash per design_system.screens.splash: lemon slice segments animate in
/// clockwise, then pulse once; SUBLEMONABLE wordmark in display type, lemon
/// yellow, tracked wide; tagline "Nothing lasts. That's the point."
public struct SplashView: View {
    public var onFinished: (() -> Void)?

    @State private var litSegments = 0
    @State private var pulse = false
    @State private var showWordmark = false

    public init(onFinished: (() -> Void)? = nil) {
        self.onFinished = onFinished
    }

    public var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()
            SubGradient.lemonGlow

            VStack(spacing: Spacing.s7) {
                ZStack {
                    LemonRindShape()
                        .fill(Color.lemonDeep)
                    ForEach(0..<8, id: \.self) { index in
                        LemonSegmentShape(index: index)
                            .fill(index < litSegments ? Color.lemon : Color.rindSoft)
                            .animation(Motion.easeDefault(0.15), value: litSegments)
                    }
                }
                .frame(width: 120, height: 120)
                .scaleEffect(pulse ? 1.08 : 1.0)
                .shadow(color: Color.lemon.opacity(pulse ? 0.35 : 0.1), radius: 40)

                VStack(spacing: Spacing.s3) {
                    Text("SUBLEMONABLE")
                        .font(SubFont.display(TypeScale.xxl, weight: .bold))
                        .tracking(8)
                        .foregroundColor(.lemon)
                    Text("Nothing lasts. That's the point.")
                        .font(SubFont.body(TypeScale.sm))
                        .foregroundColor(.textSecondary)
                }
                .opacity(showWordmark ? 1 : 0)
                .offset(y: showWordmark ? 0 : 8)
            }
        }
        .task { await runSequence() }
    }

    /// Segments in clockwise (~720ms), single pulse, wordmark reveal, done.
    private func runSequence() async {
        for segment in 1...8 {
            try? await Task.sleep(nanoseconds: 90_000_000)
            litSegments = segment
        }
        withAnimation(Motion.easeBounce(0.35)) { pulse = true }
        try? await Task.sleep(nanoseconds: 350_000_000)
        withAnimation(Motion.easeDefault(0.3)) { pulse = false }
        withAnimation(Motion.easeDefault(0.4)) { showWordmark = true }
        try? await Task.sleep(nanoseconds: 900_000_000)
        onFinished?()
    }
}
