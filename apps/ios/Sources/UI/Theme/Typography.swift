// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI
import UIKit

// Typography tokens from sublemonable-MASTER.json → design_system.tokens.typography
//
// - Display: Clash Display (fallback: system, heavy tracking handled by callers)
// - Body:    Inter (fallback: system)
// - Mono:    JetBrains Mono (fallback: .monospaced font design)
//
// CRITICAL RULE: key fingerprints ALWAYS render in JetBrains Mono; when the
// font is not bundled, the .monospaced system design is the mandated fallback.

public enum SubFont {
    /// Returns a custom font when it is bundled with the app, otherwise the
    /// given system fallback. Checked through UIFont so a missing font file
    /// never renders as Helvetica silently.
    private static func custom(_ name: String, size: CGFloat, fallback: Font) -> Font {
        UIFont(name: name, size: size) != nil ? .custom(name, size: size) : fallback
    }

    /// App name, hero headlines, section titles. Letter spacing -0.03em is
    /// applied by callers via `.tracking(...)` where the wordmark needs it.
    public static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        let name: String
        switch weight {
        case .bold, .heavy, .black: name = "ClashDisplay-Bold"
        case .medium: name = "ClashDisplay-Medium"
        default: name = "ClashDisplay-Semibold"
        }
        return custom(name, size: size, fallback: .system(size: size, weight: weight))
    }

    /// Messages, UI labels, body copy.
    public static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name = weight == .medium ? "Inter-Medium" : "Inter-Regular"
        return custom(name, size: size, fallback: .system(size: size, weight: weight))
    }

    /// Key fingerprints, security codes, timestamps.
    public static func mono(_ size: CGFloat) -> Font {
        custom("JetBrainsMono-Regular",
               size: size,
               fallback: .system(size: size, weight: .regular, design: .monospaced))
    }
}

/// Type scale (rem values from the design system at 16pt base).
public enum TypeScale {
    public static let xs: CGFloat = 12      // 0.75rem
    public static let sm: CGFloat = 14      // 0.875rem
    public static let base: CGFloat = 16    // 1rem
    public static let lg: CGFloat = 18      // 1.125rem
    public static let xl: CGFloat = 20      // 1.25rem
    public static let xxl: CGFloat = 24     // 1.5rem
    public static let xxxl: CGFloat = 30    // 1.875rem
    public static let display: CGFloat = 36 // 2.25rem
    public static let big: CGFloat = 48     // 3rem
    public static let hero: CGFloat = 80    // 5rem
    /// Message bubble font size: 0.9375rem.
    public static let message: CGFloat = 15
}
