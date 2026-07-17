// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import Sublemonable

/// The read-receipt discriminator must stay in lockstep with the canonical
/// parseReadReceipt (packages/protocol/src/receipts.ts): strict on `v` AND
/// `control` AND the message_ids array; anything else is conversation text.
final class ControlPayloadTests: XCTestCase {

    func testRecognizesCanonicalReceipt() {
        let receipt = #"{"v":1,"control":"receipt.read","message_ids":["a-b-c"]}"#
        XCTAssertTrue(MessageStore.isControlPayload(receipt))
    }

    func testRecognizesEmptyIDList() {
        XCTAssertTrue(MessageStore.isControlPayload(
            #"{"v":1,"control":"receipt.read","message_ids":[]}"#))
    }

    func testExtraFieldsStillRecognized() {
        // Lenient on extra fields, per the canonical parser.
        XCTAssertTrue(MessageStore.isControlPayload(
            #"{"v":1,"control":"receipt.read","message_ids":["x"],"future":"field"}"#))
    }

    func testPlainTextIsNotControl() {
        XCTAssertFalse(MessageStore.isControlPayload("just a message"))
    }

    func testJSONLookingTextIsNotControl() {
        // A user legitimately sending JSON must still render as text.
        XCTAssertFalse(MessageStore.isControlPayload(#"{"v":1,"control":"other"}"#))
        XCTAssertFalse(MessageStore.isControlPayload(#"{"v":2,"control":"receipt.read","message_ids":[]}"#))
        XCTAssertFalse(MessageStore.isControlPayload(#"{"control":"receipt.read","message_ids":[]}"#))
        XCTAssertFalse(MessageStore.isControlPayload(#"{"v":1,"control":"receipt.read"}"#))
    }

    func testMalformedJSONNeverThrows() {
        XCTAssertFalse(MessageStore.isControlPayload("{not json"))
        XCTAssertFalse(MessageStore.isControlPayload("{"))
        XCTAssertFalse(MessageStore.isControlPayload(""))
    }
}
