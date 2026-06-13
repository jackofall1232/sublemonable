// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import Sublemonable

final class ConnectionModeTests: XCTestCase {

    func testTorIsDefaultTransportInEveryMode() {
        for mode in ConnectionMode.allCases {
            XCTAssertTrue(mode.tor)
        }
    }

    func testHopsAndDecoyEscalate() {
        XCTAssertEqual(ConnectionMode.standard.relayHops, 1)
        XCTAssertEqual(ConnectionMode.stealth.relayHops, 3)
        XCTAssertEqual(ConnectionMode.ghost.relayHops, 3)
        XCTAssertFalse(ConnectionMode.standard.decoyTraffic)
        XCTAssertTrue(ConnectionMode.ghost.decoyTraffic)
        // Only Ghost makes every message a dead drop.
        XCTAssertTrue(ConnectionMode.ghost.deadDrop)
        XCTAssertFalse(ConnectionMode.stealth.deadDrop)
    }

    func testLitSegmentsGrowWithIntensity() {
        XCTAssertLessThan(ConnectionMode.standard.litSegments, ConnectionMode.stealth.litSegments)
        XCTAssertLessThan(ConnectionMode.stealth.litSegments, ConnectionMode.ghost.litSegments)
    }

    func testDecoyCadenceFastestForHigh() {
        XCTAssertNil(ConnectionMode.cadenceSeconds(.off))
        let high = ConnectionMode.cadenceSeconds(.high)!
        let medium = ConnectionMode.cadenceSeconds(.medium)!
        XCTAssertLessThan(high.1, medium.1)
    }

    func testPlatformWarningIsHonestAboutBrowser() {
        XCTAssertTrue(PlatformWarning.forPlatforms(own: .ios, contact: .browser).show)
        XCTAssertTrue(PlatformWarning.forPlatforms(own: .browser, contact: .android).show)
        XCTAssertFalse(PlatformWarning.forPlatforms(own: .ios, contact: .android).show)
    }

    func testPerConversationPrivacyOverridesGlobal() {
        let settings = PrivacyViewSettings(globalEnabled: false, perConversation: ["a": true])
        XCTAssertTrue(settings.active(for: "a"))
        XCTAssertFalse(settings.active(for: "b"))
    }
}
