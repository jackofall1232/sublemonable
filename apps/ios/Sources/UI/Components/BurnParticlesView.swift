// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// The burn animation: flame particles dissolve UPWARD from the bubble over
/// 600ms. CRITICAL RULE: the burn is a particle dissolve, never an opacity
/// fade. Rendered with Canvas + TimelineView so all particles draw in a
/// single pass.
public struct BurnParticlesView: View {
    private struct Particle {
        let originX: CGFloat       // 0...1 relative horizontal position
        let originY: CGFloat       // 0...1 relative vertical position
        let riseDistance: CGFloat  // points travelled upward over the lifetime
        let drift: CGFloat         // sideways wobble in points
        let size: CGFloat
        let delay: Double          // 0...0.35 of the timeline
        let hue: Int               // 0 lemon, 1 orange, 2 red
    }

    public let duration: TimeInterval
    private let startDate = Date()
    private let particles: [Particle]

    public init(duration: TimeInterval = Motion.dramatic, particleCount: Int = 90) {
        self.duration = duration
        var generator = SystemRandomNumberGenerator()
        self.particles = (0..<particleCount).map { _ in
            Particle(
                originX: CGFloat.random(in: 0...1, using: &generator),
                originY: CGFloat.random(in: 0.15...1, using: &generator),
                riseDistance: CGFloat.random(in: 28...90, using: &generator),
                drift: CGFloat.random(in: -14...14, using: &generator),
                size: CGFloat.random(in: 2...5, using: &generator),
                delay: Double.random(in: 0...0.35, using: &generator),
                hue: Int.random(in: 0...2, using: &generator)
            )
        }
    }

    public var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(startDate)
                let timelineProgress = min(1.0, elapsed / duration)
                for particle in particles {
                    // Each particle lives from its delay until the end of the timeline.
                    let life = (timelineProgress - particle.delay) / (1.0 - particle.delay)
                    guard life > 0, life <= 1 else { continue }

                    let eased = 1 - pow(1 - life, 2) // ease-out rise
                    let x = particle.originX * size.width
                        + particle.drift * sin(life * .pi * 2)
                    let y = particle.originY * size.height
                        - particle.riseDistance * eased
                    let alpha = 1.0 - life
                    let radius = particle.size * (1.0 - 0.5 * life)

                    let rect = CGRect(x: x - radius / 2,
                                      y: y - radius / 2,
                                      width: radius,
                                      height: radius)
                    context.opacity = alpha
                    context.fill(Path(ellipseIn: rect),
                                 with: .color(color(forHue: particle.hue)))
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func color(forHue hue: Int) -> Color {
        switch hue {
        case 0: return .lemon
        case 1: return .burnOrange
        default: return .burnRed
        }
    }
}
