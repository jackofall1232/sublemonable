// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// v1.5 privacy-view and platform-warning logic (UI layer only — never touches
/// crypto or the message envelope). Mirrors packages/protocol privacy.ts.
///
/// Privacy view blurs message content behind a frosted lemon overlay, revealed
/// only while actively interacting. On a screenshot, the blurred state is what
/// gets captured — partial mitigation on iOS.
public enum RevealMode: String, Codable, CaseIterable {
    case holdToReveal
    case tapTimed
    case tapToggle
}

public enum Platform: String, Codable {
    case ios, android, browser
}

public let tapTimedDurationsSeconds = [5, 10, 30]
public let tapTimedDefaultSeconds = 10

public struct PrivacyViewSettings: Codable, Equatable {
    /// Applies privacy view to every conversation.
    public var globalEnabled: Bool
    /// Per-conversation overrides, keyed by peer ID.
    public var perConversation: [String: Bool]
    public var revealMode: RevealMode
    public var tapTimedSeconds: Int

    public init(globalEnabled: Bool = false,
                perConversation: [String: Bool] = [:],
                revealMode: RevealMode = .holdToReveal,
                tapTimedSeconds: Int = tapTimedDefaultSeconds) {
        self.globalEnabled = globalEnabled
        self.perConversation = perConversation
        self.revealMode = revealMode
        self.tapTimedSeconds = tapTimedSeconds
    }

    /// True if privacy view is active for a given conversation.
    public func active(for peerID: String) -> Bool {
        perConversation[peerID] ?? globalEnabled
    }
}

/// Warning copy for the platform badge — browser clients can't block screenshots.
public enum PlatformWarning {
    public static let contactOnBrowser = "🌐 Messaging via browser — screenshot protection unavailable"
    public static let ownBrowser = "🌐 You're on browser — your messages can be screenshotted"

    public struct Result: Equatable {
        public let show: Bool
        public let copy: String
    }

    /// Whether to warn, and which copy, given who is on what.
    public static func forPlatforms(own: Platform, contact: Platform?) -> Result {
        if own == .browser { return Result(show: true, copy: ownBrowser) }
        if contact == .browser { return Result(show: true, copy: contactOnBrowser) }
        return Result(show: false, copy: "")
    }
}
