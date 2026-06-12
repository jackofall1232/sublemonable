// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Compose bar per design_system.components.compose_bar.
/// The send button is ALWAYS lemon yellow — it is the primary action colour.
public struct ComposeBar: View {
    @Binding var text: String
    @Binding var burnOnRead: Bool
    @Binding var ttlSeconds: Int?
    public var onSend: () -> Void

    @FocusState private var focused: Bool

    /// disappearing_messages.options_seconds from the master spec.
    public static let ttlOptions: [Int] = [30, 60, 300, 3600, 86400, 604800]

    public init(text: Binding<String>,
                burnOnRead: Binding<Bool>,
                ttlSeconds: Binding<Int?>,
                onSend: @escaping () -> Void) {
        _text = text
        _burnOnRead = burnOnRead
        _ttlSeconds = ttlSeconds
        self.onSend = onSend
    }

    public var body: some View {
        HStack(spacing: Spacing.s3) {
            ephemeralMenu

            TextField("", text: $text, axis: .vertical)
                .font(SubFont.body(TypeScale.message))
                .foregroundColor(.textPrimary)
                .tint(.lemon)
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s2 + 2)
                .background(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .fill(Color.backgroundElevated)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .strokeBorder(focused ? Color.borderActive : Color.borderToken,
                                      lineWidth: 1)
                )
                .overlay(alignment: .leading) {
                    if text.isEmpty {
                        Text("Encrypted message…")
                            .font(SubFont.body(TypeScale.message))
                            .foregroundColor(.textMuted)
                            .padding(.horizontal, Spacing.s4)
                            .allowsHitTesting(false)
                    }
                }

            sendButton
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .background(Color.backgroundSecondary)
        .overlay(alignment: .top) {
            Rectangle().fill(Color.borderToken).frame(height: 1)
        }
    }

    /// Attachment-position control: burn-on-read + TTL selection.
    private var ephemeralMenu: some View {
        Menu {
            Toggle(isOn: $burnOnRead) {
                Label("Burn on read", systemImage: "flame")
            }
            Menu("Disappear after") {
                Button("Off") { ttlSeconds = nil }
                ForEach(Self.ttlOptions, id: \.self) { option in
                    Button(Self.label(forTTL: option)) { ttlSeconds = option }
                }
            }
        } label: {
            Image(systemName: burnOnRead ? "flame.fill" : "timer")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(burnOnRead || ttlSeconds != nil ? .lemon : .textSecondary)
                .frame(width: 32, height: 32)
        }

    }

    private var sendButton: some View {
        Button(action: sendIfPossible) {
            ZStack {
                Circle().fill(Color.lemon)
                LemonSliceView(variant: .sendButton)
                    .frame(width: 22, height: 22)
            }
            .frame(width: 40, height: 40) // 40pt per spec
        }
        .buttonStyle(LemonSpringButtonStyle())
        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
        .accessibilityLabel("Send encrypted message")
    }

    private func sendIfPossible() {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        onSend()
    }

    static func label(forTTL seconds: Int) -> String {
        switch seconds {
        case 30: return "30 seconds"
        case 60: return "1 minute"
        case 300: return "5 minutes"
        case 3600: return "1 hour"
        case 86400: return "1 day"
        case 604800: return "1 week"
        default: return "\(seconds) s"
        }
    }
}

/// Press: scale(0.92) with spring-back via easing_bounce, plus lemon glow.
public struct LemonSpringButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1.0)
            .shadow(color: Color.lemon.opacity(configuration.isPressed ? 0.4 : 0.0),
                    radius: 16)
            .animation(Motion.easeBounce(Motion.base), value: configuration.isPressed)
    }
}
