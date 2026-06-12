// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Onboarding per design_system.screens.onboarding: full-screen card stack,
/// swipe-through, exactly the four slides from the spec.
public struct OnboardingView: View {
    public var onComplete: () -> Void

    @State private var page = 0

    public init(onComplete: @escaping () -> Void) {
        self.onComplete = onComplete
    }

    private struct Slide {
        let headline: String
        let body: String
    }

    private let slides: [Slide] = [
        Slide(headline: "End-to-end encrypted",
              body: "Your messages are locked before they leave your device. We can't read them. Nobody can."),
        Slide(headline: "Messages that disappear",
              body: "Set any message to self-destruct. Once read, once seen, then gone."),
        Slide(headline: "Screenshots? Blocked.",
              body: "On Android, screenshots are impossible. On iOS and browser, we blur instantly."),
        Slide(headline: "No phone number needed",
              body: "Add contacts by QR code or link. We don't need your number, your email, or your name.")
    ]

    public var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: Spacing.s6) {
                TabView(selection: $page) {
                    ForEach(slides.indices, id: \.self) { index in
                        slideView(slides[index], index: index)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                pageDots

                Button(action: advance) {
                    Text(page == slides.count - 1 ? "Get started" : "Next")
                        .font(SubFont.body(TypeScale.base, weight: .medium))
                        .foregroundColor(.textOnLemon)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.s4)
                        .background(Capsule().fill(Color.lemon))
                }
                .buttonStyle(LemonSpringButtonStyle())
                .padding(.horizontal, Spacing.s6)

                Button("Skip") { onComplete() }
                    .font(SubFont.body(TypeScale.sm))
                    .foregroundColor(.textMuted)
                    .padding(.bottom, Spacing.s4)
            }
            .padding(.top, Spacing.s6)
        }
    }

    private func advance() {
        if page < slides.count - 1 {
            withAnimation(Motion.easeDefault()) { page += 1 }
        } else {
            onComplete()
        }
    }

    private var pageDots: some View {
        HStack(spacing: Spacing.s2) {
            ForEach(slides.indices, id: \.self) { index in
                Capsule()
                    .fill(index == page ? Color.lemon : Color.rindSoft)
                    .frame(width: index == page ? 20 : 8, height: 8)
                    .animation(Motion.easeDefault(), value: page)
            }
        }
    }

    @ViewBuilder
    private func slideView(_ slide: Slide, index: Int) -> some View {
        VStack(spacing: Spacing.s7) {
            Spacer()
            slideVisual(index)
                .frame(width: 180, height: 180)
            VStack(spacing: Spacing.s4) {
                Text(slide.headline)
                    .font(SubFont.display(TypeScale.xxxl, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.center)
                Text(slide.body)
                    .font(SubFont.body(TypeScale.base))
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.s7)
            }
            Spacer()
        }
    }

    /// Visuals per spec: encryption-layers slice / burning bubble /
    /// blurred screenshot mockup / QR with lemon-slice overlay.
    @ViewBuilder
    private func slideVisual(_ index: Int) -> some View {
        switch index {
        case 0:
            // Animated lemon slice — segments = encryption layers.
            EncryptionLayersVisual()
        case 1:
            // Message bubble with looping burn animation.
            BurnLoopVisual()
        case 2:
            // Pixelated/blurred screenshot mockup.
            BlurMockVisual()
        default:
            // QR code with lemon-slice overlay.
            ZStack {
                FingerprintQRCode(payload: "sublemonable://hello", size: 150)
                LemonSliceView(variant: .logoMark)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.backgroundPrimary).padding(-6))
            }
        }
    }
}

// MARK: - Slide visuals

private struct EncryptionLayersVisual: View {
    @State private var segments = 0
    private let tick = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    var body: some View {
        LemonSliceView(variant: .securityIndicator(segments: segments))
            .onReceive(tick) { _ in segments = (segments + 1) % 9 }
    }
}

private struct BurnLoopVisual: View {
    @State private var burning = false
    private let tick = Timer.publish(every: 2.2, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            UnevenRoundedRectangle(topLeadingRadius: Radius.lg,
                                   bottomLeadingRadius: Radius.lg,
                                   bottomTrailingRadius: 4,
                                   topTrailingRadius: Radius.lg)
                .fill(Color.lemon)
                .frame(width: 150, height: 56)
                .scaleEffect(burning ? 0.05 : 1.0, anchor: .bottom)
                .opacity(burning ? 0 : 1)
                .animation(Motion.easeBurn(Motion.dramatic), value: burning)
            if burning {
                BurnParticlesView()
                    .frame(width: 180, height: 120)
            }
        }
        .onReceive(tick) { _ in
            burning = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { burning = false }
        }
    }
}

private struct BlurMockVisual: View {
    var body: some View {
        VStack(spacing: Spacing.s2) {
            ForEach(0..<4, id: \.self) { row in
                RoundedRectangle(cornerRadius: Radius.md)
                    .fill(row.isMultiple(of: 2)
                          ? Color.backgroundElevated
                          : Color.lemon.opacity(0.85))
                    .frame(width: row.isMultiple(of: 2) ? 130 : 100, height: 26)
                    .frame(maxWidth: .infinity,
                           alignment: row.isMultiple(of: 2) ? .leading : .trailing)
            }
        }
        .frame(width: 160)
        .blur(radius: 7)
        .overlay(
            Image(systemName: "eye.slash.fill")
                .font(.system(size: 32))
                .foregroundColor(.lemon)
        )
    }
}
