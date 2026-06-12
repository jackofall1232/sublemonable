// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// The Lemon Slice — Sublemonable's signature element.
///
/// A segmented circle (8 wedges inside a rind ring) used as the logo mark,
/// loading indicator, burn timer, security badge, and send button glyph.
/// Every moment of waiting, protecting, or destroying in the app is shown
/// through this one motif. Per the design system, this is the ONLY loading
/// indicator allowed anywhere in the app.
public enum LemonSliceVariant: Equatable {
    /// Static 8-segment lemon slice icon, all segments lit.
    case logoMark
    /// Segments illuminate clockwise on a timer. Used for EVERY loading state.
    case loadingSpinner
    /// Segments extinguish as TTL counts down.
    /// Lit segments turn orange at <= 2 remaining, red at 1.
    case burnTimer(remainingSeconds: TimeInterval, totalSeconds: TimeInterval)
    /// Segments fill based on verification level (0–8).
    case securityIndicator(segments: Int)
    /// Glyph used inside the lemon-yellow circular send button.
    case sendButton
}

/// One pie wedge of the 8-segment slice, with a small angular gap so the
/// segments read as separate "pulp" wedges, like a real lemon cross-section.
public struct LemonSegmentShape: Shape {
    public var index: Int
    public var totalSegments: Int = 8
    public var gapDegrees: Double = 6
    public var innerRadiusRatio: CGFloat = 0.16
    public var outerRadiusRatio: CGFloat = 0.80

    public init(index: Int) {
        self.index = index
    }

    public func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let maxRadius = min(rect.width, rect.height) / 2
        let outer = maxRadius * outerRadiusRatio
        let inner = maxRadius * innerRadiusRatio
        let sweep = 360.0 / Double(totalSegments)
        // Start at 12 o'clock so the spinner reads as a clock.
        let start = Angle(degrees: -90 + Double(index) * sweep + gapDegrees / 2)
        let end = Angle(degrees: -90 + Double(index + 1) * sweep - gapDegrees / 2)

        var path = Path()
        path.addArc(center: center, radius: inner, startAngle: start, endAngle: end, clockwise: false)
        path.addArc(center: center, radius: outer, startAngle: end, endAngle: start, clockwise: true)
        path.closeSubpath()
        return path
    }
}

/// The outer "rind" ring that frames the eight pulp segments.
public struct LemonRindShape: Shape {
    public var thicknessRatio: CGFloat = 0.09

    public init() {}

    public func path(in rect: CGRect) -> Path {
        let maxRadius = min(rect.width, rect.height) / 2
        let thickness = maxRadius * thicknessRatio
        let radius = maxRadius - thickness / 2
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        path.addArc(center: center,
                    radius: radius,
                    startAngle: .degrees(0),
                    endAngle: .degrees(360),
                    clockwise: false)
        return path.strokedPath(StrokeStyle(lineWidth: thickness))
    }
}

public struct LemonSliceView: View {
    public let variant: LemonSliceVariant

    /// Spinner state: number of segments currently illuminated (0–8), cycling.
    @State private var spinnerLit: Int = 0

    private let spinnerTick = Timer.publish(every: 0.12, on: .main, in: .common).autoconnect()

    public init(variant: LemonSliceVariant) {
        self.variant = variant
    }

    public var body: some View {
        ZStack {
            LemonRindShape()
                .fill(rindColor)
            ForEach(0..<8, id: \.self) { index in
                LemonSegmentShape(index: index)
                    .fill(color(forSegment: index))
                    .animation(.easeOut(duration: 0.2), value: spinnerLit)
            }
        }
        .onReceive(spinnerTick) { _ in
            guard case .loadingSpinner = variant else { return }
            // Segments illuminate clockwise one by one, then the ring resets.
            spinnerLit = (spinnerLit + 1) % 9
        }
        .accessibilityLabel(accessibilityText)
    }

    // MARK: - Segment colouring per variant

    private func color(forSegment index: Int) -> Color {
        switch variant {
        case .logoMark:
            return .lemon

        case .sendButton:
            // Rendered on the lemon-yellow circular send button.
            return .textOnLemon

        case .loadingSpinner:
            return index < spinnerLit ? .lemon : .rindSoft

        case let .burnTimer(remaining, total):
            let lit = BurnTimerMath.segmentsRemaining(remaining: remaining, total: total)
            guard index < lit else { return .segmentEmpty }
            switch BurnTimerMath.phase(forSegments: lit) {
            case .normal: return .lemon
            case .critical: return .burnOrange
            case .final: return .burnRed
            }

        case let .securityIndicator(segments):
            let clamped = max(0, min(8, segments))
            return index < clamped ? .lemon : .segmentEmpty
        }
    }

    private var rindColor: Color {
        switch variant {
        case .sendButton: return .textOnLemon
        case let .burnTimer(remaining, total):
            let lit = BurnTimerMath.segmentsRemaining(remaining: remaining, total: total)
            switch BurnTimerMath.phase(forSegments: lit) {
            case .normal: return .lemonDeep
            case .critical: return .burnOrange
            case .final: return .burnRed
            }
        default: return .lemonDeep
        }
    }

    private var accessibilityText: Text {
        switch variant {
        case .logoMark: return Text("Sublemonable")
        case .loadingSpinner: return Text("Loading")
        case .burnTimer: return Text("Message burn timer")
        case let .securityIndicator(segments): return Text("Security level \(segments) of 8")
        case .sendButton: return Text("Send")
        }
    }
}

// MARK: - Pulse modifier (splash / unlock moments)

public struct LemonPulse: ViewModifier {
    @State private var pulsed = false
    public func body(content: Content) -> some View {
        content
            .scaleEffect(pulsed ? 1.0 : 0.94)
            .shadow(color: Color.lemon.opacity(pulsed ? 0.30 : 0.10),
                    radius: pulsed ? 32 : 12)
            .animation(
                .easeInOut(duration: 1.6).repeatForever(autoreverses: true),
                value: pulsed
            )
            .onAppear { pulsed = true }
    }
}

public extension View {
    /// Slow ambient lemon-glow pulse, used on the splash logo.
    func lemonPulse() -> some View { modifier(LemonPulse()) }
}
