// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

// Design tokens from sublemonable-MASTER.json → design_system.tokens.color
//
// CRITICAL RULES:
// - Dark only. NEVER use white backgrounds — the minimum dark value is #1A1800.
// - NEVER use blue for any interactive element — lemon yellow owns interactivity.

public extension Color {
    /// Build a Color from a 24-bit hex value, e.g. 0xF5E642.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: 1.0
        )
    }

    // MARK: Core

    static let lemon = Color(hex: 0xF5E642)
    static let lemonBright = Color(hex: 0xFFE500)
    static let lemonDeep = Color(hex: 0xD4C200)
    static let lemonPale = Color(hex: 0xFFFDE0)
    static let lemonZest = Color(hex: 0xE8B800)
    static let rind = Color(hex: 0x2A2500)
    static let rindSoft = Color(hex: 0x3D3800)
    static let pulp = Color(hex: 0xFFF8C0)
    static let offWhite = Color(hex: 0xFAFAF2)

    // MARK: Semantic

    static let backgroundPrimary = Color(hex: 0x0D0C00)
    static let backgroundSecondary = Color(hex: 0x1A1800)
    static let backgroundElevated = Color(hex: 0x242100)
    static let backgroundMessageSent = Color(hex: 0xF5E642)
    static let backgroundMessageReceived = Color(hex: 0x242100)
    static let textPrimary = Color(hex: 0xFAFAF2)
    static let textSecondary = Color(hex: 0xA8A070)
    static let textOnLemon = Color(hex: 0x0D0C00)
    static let textMuted = Color(hex: 0x5A5630)
    static let borderToken = Color(hex: 0x2E2B00)
    static let borderActive = Color(hex: 0xF5E642)
    static let burnRed = Color(hex: 0xFF4444)
    static let burnOrange = Color(hex: 0xFF8C00)
    static let verifiedGreen = Color(hex: 0x4ADE80)
    static let errorRed = Color(hex: 0xFF4444)
    static let successGreen = Color(hex: 0x4ADE80)

    /// Empty (extinguished) lemon-slice segment colour.
    static let segmentEmpty = Color(hex: 0x2E2B00)
}

public enum SubGradient {
    /// design_system.tokens.color.gradients.hero
    public static let hero = LinearGradient(
        colors: [Color(hex: 0x0D0C00), Color(hex: 0x1A1800), Color(hex: 0x2A2500)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// design_system.tokens.color.gradients.lemon_glow
    public static let lemonGlow = RadialGradient(
        colors: [Color.lemon.opacity(0.15), .clear],
        center: .center,
        startRadius: 0,
        endRadius: 280
    )

    /// design_system.tokens.color.gradients.message_burn
    public static let messageBurn = LinearGradient(
        colors: [.burnRed, .burnOrange, .lemon],
        startPoint: .leading,
        endPoint: .trailing
    )

    /// Avatar background ("lemon gradient" per conversation_list_item).
    public static let avatar = LinearGradient(
        colors: [.lemonBright, .lemonZest],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
