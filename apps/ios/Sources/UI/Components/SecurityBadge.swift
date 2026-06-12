// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Encryption / verification status badge per
/// design_system.components.security_badge.
public struct SecurityBadge: View {
    public enum Status: Equatable {
        /// Keys verified — green, lemon slice with checkmark.
        case verified
        /// Not yet verified — muted, lemon slice outline, "Tap to verify".
        case unverified
        /// Identity key changed — orange warning.
        case keyChanged
    }

    public let status: Status
    public var onTap: (() -> Void)?

    public init(status: Status, onTap: (() -> Void)? = nil) {
        self.status = status
        self.onTap = onTap
    }

    public var body: some View {
        Button { onTap?() } label: {
            HStack(spacing: Spacing.s2) {
                ZStack {
                    LemonSliceView(variant: .securityIndicator(segments: segments))
                        .frame(width: 16, height: 16)
                        .saturation(status == .unverified ? 0 : 1)
                    if status == .verified {
                        Image(systemName: "checkmark")
                            .font(.system(size: 7, weight: .heavy))
                            .foregroundColor(.textOnLemon)
                    }
                }
                Text(label)
                    .font(SubFont.body(TypeScale.xs, weight: .medium))
                    .foregroundColor(color)
            }
            .padding(.horizontal, Spacing.s3)
            .padding(.vertical, Spacing.s1)
            .background(Capsule().fill(Color.backgroundElevated))
            .overlay(Capsule().strokeBorder(color.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var segments: Int {
        switch status {
        case .verified: return 8
        case .unverified: return 0
        case .keyChanged: return 4
        }
    }

    private var label: String {
        switch status {
        case .verified: return "Keys verified"
        case .unverified: return "Tap to verify"
        case .keyChanged: return "Key changed — verify identity"
        }
    }

    private var color: Color {
        switch status {
        case .verified: return .verifiedGreen
        case .unverified: return .textSecondary
        case .keyChanged: return .burnOrange
        }
    }
}

/// Persistent micro-badge pinned to the top of every chat:
/// "🔒 End-to-end encrypted" in muted lemon.
public struct EncryptionMicroBadge: View {
    public init() {}

    public var body: some View {
        Text("🔒 End-to-end encrypted")
            .font(SubFont.body(TypeScale.xs, weight: .medium))
            .foregroundColor(Color.lemon.opacity(0.65))
            .padding(.horizontal, Spacing.s3)
            .padding(.vertical, Spacing.s1)
            .background(Capsule().fill(Color.backgroundSecondary))
            .overlay(Capsule().strokeBorder(Color.borderToken, lineWidth: 1))
    }
}
