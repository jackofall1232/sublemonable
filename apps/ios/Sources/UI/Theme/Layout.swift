// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

// Spacing, radius, shadow and motion tokens from
// sublemonable-MASTER.json → design_system.tokens

/// Spacing scale, base unit 4pt: [0,4,8,12,16,20,24,32,40,48,64,80,96,128]
public enum Spacing {
    public static let s0: CGFloat = 0
    public static let s1: CGFloat = 4
    public static let s2: CGFloat = 8
    public static let s3: CGFloat = 12
    public static let s4: CGFloat = 16
    public static let s5: CGFloat = 20
    public static let s6: CGFloat = 24
    public static let s7: CGFloat = 32
    public static let s8: CGFloat = 40
    public static let s9: CGFloat = 48
    public static let s10: CGFloat = 64
    public static let s11: CGFloat = 80
    public static let s12: CGFloat = 96
    public static let s13: CGFloat = 128
}

public enum Radius {
    public static let sm: CGFloat = 6
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 18
    public static let xl: CGFloat = 24
    public static let pill: CGFloat = 9999
    /// bubble_sent: 18 18 4 18 (top-left, top-right, bottom-right, bottom-left)
    public static let bubbleSentSharpCorner: CGFloat = 4
    /// bubble_received: 18 18 18 4
    public static let bubbleReceivedSharpCorner: CGFloat = 4
}

public enum Motion {
    /// 120ms — screenshot blur must land inside this budget.
    public static let fast: TimeInterval = 0.12
    public static let base: TimeInterval = 0.20
    public static let slow: TimeInterval = 0.40
    /// 600ms — the burn (particle dissolve) duration.
    public static let dramatic: TimeInterval = 0.60

    /// easing_default: cubic-bezier(0.16, 1, 0.3, 1)
    public static func easeDefault(_ duration: TimeInterval = base) -> Animation {
        .timingCurve(0.16, 1, 0.3, 1, duration: duration)
    }

    /// easing_bounce: cubic-bezier(0.34, 1.56, 0.64, 1) — spring-back feel.
    public static func easeBounce(_ duration: TimeInterval = base) -> Animation {
        .timingCurve(0.34, 1.56, 0.64, 1, duration: duration)
    }

    /// easing_burn: cubic-bezier(0.4, 0, 1, 1)
    public static func easeBurn(_ duration: TimeInterval = dramatic) -> Animation {
        .timingCurve(0.4, 0, 1, 1, duration: duration)
    }
}

public enum Shadows {
    public static func lemonGlowSmall<V: View>(_ view: V) -> some View {
        view.shadow(color: Color.lemon.opacity(0.30), radius: 12)
    }
    public static func lemonGlowMedium<V: View>(_ view: V) -> some View {
        view.shadow(color: Color.lemon.opacity(0.20), radius: 32)
    }
    public static func lemonGlowLarge<V: View>(_ view: V) -> some View {
        view.shadow(color: Color.lemon.opacity(0.15), radius: 80)
    }
    public static func burn<V: View>(_ view: V) -> some View {
        view.shadow(color: Color.burnRed.opacity(0.40), radius: 20)
    }
}

public extension View {
    func lemonGlowSmall() -> some View { shadow(color: Color.lemon.opacity(0.30), radius: 12) }
    func lemonGlowMedium() -> some View { shadow(color: Color.lemon.opacity(0.20), radius: 32) }
    func cardShadow() -> some View { shadow(color: .black.opacity(0.40), radius: 24, y: 4) }
}
