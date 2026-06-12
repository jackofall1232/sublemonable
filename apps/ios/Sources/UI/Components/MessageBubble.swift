// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Message bubble per design_system.components.message_bubble.
///
/// Sent:     #F5E642 background, #0D0C00 text, radii 18/18/4/18 (TL/TR/BR/BL)
/// Received: #242100 background, #FAFAF2 text, 1pt #2E2B00 border, radii 18/18/18/4
/// Max width 72% of the container. Font size 0.9375rem (15pt).
///
/// CRITICAL RULE: message content is always dark bg with light text or lemon
/// bg with dark text — never inverted, never white.
public struct MessageBubble: View {
    public let message: Message
    /// Called when a burn-on-read message is opened for the first time.
    public var onOpen: (() -> Void)?
    /// Called when a TTL expires or the burn animation finishes; the store
    /// destroys the local plaintext copy in response.
    public var onBurnFinished: (() -> Void)?

    @State private var burnScale: CGFloat = 1.0
    @State private var burnTextOpacity: Double = 1.0
    @State private var revealed: Bool

    public init(message: Message,
                onOpen: (() -> Void)? = nil,
                onBurnFinished: (() -> Void)? = nil) {
        self.message = message
        self.onOpen = onOpen
        self.onBurnFinished = onBurnFinished
        // Burn-on-read messages start hidden behind a "tap to read" cover.
        _revealed = State(initialValue: !(message.burnOnRead && !message.isOutgoing))
    }

    public var body: some View {
        HStack {
            if message.isOutgoing { Spacer(minLength: 0) }
            bubble
                .frame(
                    maxWidth: UIScreen.main.bounds.width * 0.72,
                    alignment: message.isOutgoing ? .trailing : .leading
                )
            if !message.isOutgoing { Spacer(minLength: 0) }
        }
        .frame(maxWidth: .infinity)
        .onChange(of: message.state) { newState in
            if newState == .burning { startBurn() }
        }
    }

    @ViewBuilder
    private var bubble: some View {
        ZStack(alignment: .topTrailing) {
            content
                .padding(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
                .background(bubbleBackground)
                .overlay(bubbleBorder)
                .clipShape(bubbleShape)
                .opacity(burnTextOpacity)
                .scaleEffect(burnScale, anchor: .bottom)

            indicator
                .offset(x: 6, y: -6)

            if message.state == .burning {
                // Particle dissolve upward over 600ms — NOT an opacity fade.
                BurnParticlesView(duration: Motion.dramatic)
                    .padding(-Spacing.s5)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if revealed {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                Text(message.text)
                    .font(SubFont.body(TypeScale.message))
                    .foregroundColor(message.isOutgoing ? .textOnLemon : .textPrimary)
                    .textSelection(.disabled)
                Text(message.sentAt, style: .time)
                    .font(SubFont.mono(TypeScale.xs - 2))
                    .foregroundColor(message.isOutgoing
                                     ? Color.textOnLemon.opacity(0.55)
                                     : .textMuted)
            }
        } else {
            // Burn-on-read cover: opening starts the read (and the burn).
            Button {
                revealed = true
                onOpen?()
            } label: {
                HStack(spacing: Spacing.s2) {
                    Image(systemName: "flame.fill")
                        .foregroundColor(.burnOrange)
                    Text("Tap to read — burns after reading")
                        .font(SubFont.body(TypeScale.sm, weight: .medium))
                        .foregroundColor(.textSecondary)
                }
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var indicator: some View {
        if message.burnOnRead {
            // Small flame icon on the bubble corner, lemon-orange.
            Image(systemName: "flame.fill")
                .font(.system(size: 11))
                .foregroundColor(.burnOrange)
                .padding(3)
                .background(Circle().fill(Color.backgroundSecondary))
        } else if let expiresAt = message.expiresAt, let ttl = message.ttlSeconds {
            BurnTimerView(
                expiresAt: expiresAt,
                totalSeconds: TimeInterval(ttl),
                size: 16,
                onExpired: { onBurnFinished?() }
            )
            .padding(2)
            .background(Circle().fill(Color.backgroundSecondary))
        }
    }

    private var bubbleShape: UnevenRoundedRectangle {
        if message.isOutgoing {
            // 18 18 4 18 → sharp bottom-right
            return UnevenRoundedRectangle(
                topLeadingRadius: Radius.lg,
                bottomLeadingRadius: Radius.lg,
                bottomTrailingRadius: Radius.bubbleSentSharpCorner,
                topTrailingRadius: Radius.lg
            )
        } else {
            // 18 18 18 4 → sharp bottom-left
            return UnevenRoundedRectangle(
                topLeadingRadius: Radius.lg,
                bottomLeadingRadius: Radius.bubbleReceivedSharpCorner,
                bottomTrailingRadius: Radius.lg,
                topTrailingRadius: Radius.lg
            )
        }
    }

    private var bubbleBackground: some View {
        bubbleShape.fill(message.isOutgoing
                         ? Color.backgroundMessageSent
                         : Color.backgroundMessageReceived)
    }

    @ViewBuilder
    private var bubbleBorder: some View {
        if !message.isOutgoing {
            bubbleShape.strokeBorder(Color.borderToken, lineWidth: 1)
        }
    }

    /// Bubble chars and shrinks to nothing over 600ms while the particles
    /// rise; completion destroys the local plaintext copy.
    private func startBurn() {
        withAnimation(Motion.easeBurn(Motion.dramatic)) {
            burnScale = 0.05
            burnTextOpacity = 0.0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.dramatic) {
            onBurnFinished?()
        }
    }
}
