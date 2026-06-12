// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Optional Tor routing via Orbot (https://orbot.app), strictly OPT-IN from
/// Settings → Network. Disabled by default per the master spec.
///
/// On iOS, Orbot runs as a system-wide VPN — once the user starts it, ALL of
/// Sublemonable's traffic (REST + WebSocket) is routed through Tor without
/// any change to our networking stack. This integration therefore only:
///   1. detects whether Orbot is installed (orbot:// URL scheme — requires
///      "orbot" in LSApplicationQueriesSchemes),
///   2. deep-links the user into Orbot to start/stop the VPN,
///   3. remembers the user's opt-in preference (a UI preference, not a
///      secret — stored in UserDefaults; no key material involved).
@MainActor
public final class OrbotIntegration: ObservableObject {
    public static let shared = OrbotIntegration()

    private static let orbotScheme = "orbot://"
    private static let orbotStartURL = "orbot://start"
    private static let appStoreURL = "https://apps.apple.com/app/orbot/id1609461599"
    private static let preferenceKey = "org.sublemonable.tor-opt-in"

    /// The user's opt-in choice. Turning this on does not guarantee Tor is
    /// active — Orbot's VPN must actually be running; we surface that nuance
    /// in the Settings UI copy.
    @Published public var torOptIn: Bool {
        didSet { UserDefaults.standard.set(torOptIn, forKey: Self.preferenceKey) }
    }

    public init() {
        self.torOptIn = UserDefaults.standard.bool(forKey: Self.preferenceKey)
    }

    public var isOrbotInstalled: Bool {
        guard let url = URL(string: Self.orbotScheme) else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    /// Deep-links into Orbot so the user can start the Tor VPN. Falls back to
    /// the App Store when Orbot is not installed.
    public func openOrbot() {
        if isOrbotInstalled, let url = URL(string: Self.orbotStartURL) {
            UIApplication.shared.open(url)
        } else if let url = URL(string: Self.appStoreURL) {
            UIApplication.shared.open(url)
        }
    }
}
