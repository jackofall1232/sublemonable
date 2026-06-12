// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Pure segment math for the lemon-slice burn timer. Kept free of any UI
/// dependencies so it is unit-testable.
public enum BurnTimerMath {
    public enum Phase: Equatable {
        /// > 2 segments remaining — lemon yellow.
        case normal
        /// 2 segments remaining — burn orange.
        case critical
        /// 1 segment remaining — burn red; expiry triggers the destruction animation.
        case final
    }

    /// Maps remaining TTL onto 0–8 lit segments. While any time remains, at
    /// least one segment stays lit (the message is not yet destroyed).
    public static func segmentsRemaining(remaining: TimeInterval, total: TimeInterval) -> Int {
        guard total > 0, remaining > 0 else { return 0 }
        let fraction = min(1.0, remaining / total)
        return min(8, max(1, Int((fraction * 8).rounded(.up))))
    }

    public static func phase(forSegments segments: Int) -> Phase {
        switch segments {
        case ...1: return .final
        case 2: return .critical
        default: return .normal
        }
    }

    /// True when less than 10% of the TTL remains — drives the warning pulse.
    public static func isWarning(remaining: TimeInterval, total: TimeInterval) -> Bool {
        guard total > 0 else { return false }
        return remaining > 0 && remaining / total < 0.10
    }
}

/// Mini lemon-slice countdown shown in the corner of timed message bubbles.
/// Segments extinguish as the TTL counts down; the final segment expiring
/// triggers the destruction (particle dissolve) animation in MessageBubble.
public struct BurnTimerView: View {
    public let expiresAt: Date
    public let totalSeconds: TimeInterval
    public var size: CGFloat = 16
    public var onExpired: (() -> Void)?

    @State private var now = Date()
    private let tick = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()
    @State private var warningPulse = false

    public init(expiresAt: Date,
                totalSeconds: TimeInterval,
                size: CGFloat = 16,
                onExpired: (() -> Void)? = nil) {
        self.expiresAt = expiresAt
        self.totalSeconds = totalSeconds
        self.size = size
        self.onExpired = onExpired
    }

    private var remaining: TimeInterval {
        max(0, expiresAt.timeIntervalSince(now))
    }

    public var body: some View {
        LemonSliceView(variant: .burnTimer(remainingSeconds: remaining,
                                           totalSeconds: totalSeconds))
            .frame(width: size, height: size)
            .shadow(color: Color.lemon.opacity(warningPulse ? 0.6 : 0.0), radius: 6)
            .onReceive(tick) { date in
                now = date
                let warning = BurnTimerMath.isWarning(remaining: remaining, total: totalSeconds)
                if warning != warningPulse {
                    withAnimation(.easeInOut(duration: 0.4).repeatForever(autoreverses: true)) {
                        warningPulse = warning
                    }
                }
                if remaining <= 0 {
                    onExpired?()
                }
            }
            .accessibilityLabel("Disappears in \(Int(remaining)) seconds")
    }
}
