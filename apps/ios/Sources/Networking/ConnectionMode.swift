// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// v1.5 connection modes. Three user-selectable bundles that compose the
/// network-layer features of the security onion. Values MUST stay in lockstep
/// with packages/protocol connection.ts.
///
/// Tor is the default transport in every mode — clearnet is only ever a flagged
/// fallback, never a primary choice.
public enum CoverTrafficIntensity: String, Codable, CaseIterable {
    case off, low, medium, high
}

/// Live transport state shown by the connection-mode badge.
///
/// I2P is a skeleton in v1.5 — never emitted — but present so this enum stays in
/// lockstep with packages/protocol and a future release can enable it.
public enum TransportState: String, Codable {
    case tor
    case i2p
    case clearnetFallback
    case offline
}

/// User-selectable preferred anonymous transport. `torFirst` tries Tor then I2P
/// then clearnet; `i2pFirst` tries I2P then Tor then clearnet. In v1.5 I2P is a
/// skeleton, so `i2pFirst` falls through to Tor. The option persists so the
/// choice survives until I2P goes live. MUST stay in lockstep with
/// packages/protocol transport.ts (raw values match "tor_first"/"i2p_first").
public enum PreferredTransport: String, Codable, CaseIterable {
    case torFirst = "tor_first"
    case i2pFirst = "i2p_first"

    public static let `default` = PreferredTransport.torFirst
}

public enum ConnectionMode: String, Codable, CaseIterable {
    case standard, stealth, ghost

    public static let `default` = ConnectionMode.standard

    /// Tor is always on in v1.5 — clearnet is fallback, not a mode.
    public var tor: Bool { true }

    public var label: String {
        switch self {
        case .standard: return "Standard"
        case .stealth: return "Stealth"
        case .ghost: return "Ghost"
        }
    }

    public var relayHops: Int {
        switch self {
        case .standard: return 1
        case .stealth, .ghost: return 3
        }
    }

    public var decoyTraffic: Bool { self != .standard }

    public var decoyIntensity: CoverTrafficIntensity {
        switch self {
        case .standard: return .off
        case .stealth: return .medium
        case .ghost: return .high
        }
    }

    /// Ghost: every message is a dead drop; no direct channel exists.
    public var deadDrop: Bool { self == .ghost }

    /// Lemon-slice segments lit for this mode's badge (of 8).
    public var litSegments: Int {
        switch self {
        case .standard: return 1
        case .stealth: return 3
        case .ghost: return 8
        }
    }

    public var summary: String {
        switch self {
        case .standard:
            return "Tor routing + single relay hop + Sealed Sender. Suitable for everyday use."
        case .stealth:
            return "Tor routing + 3-hop onion relay + decoy traffic. For sensitive communications."
        case .ghost:
            return "Tor + 3-hop relay + continuous decoy traffic + dead drop only. "
                + "No persistent identity visible on the network."
        }
    }

    /// Decoy cadence per intensity as (minSeconds, maxSeconds), or nil for no standing cadence.
    public static func cadenceSeconds(_ intensity: CoverTrafficIntensity) -> (Int, Int)? {
        switch intensity {
        case .off: return nil
        case .low: return nil // one decoy per real message — event-driven
        case .medium: return (30, 120)
        case .high: return (5, 30)
        }
    }
}
