// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import Sublemonable

/// Byte-compatibility tests for the length-hiding padding scheme shared with
/// the web client (packages/crypto/src/padding.ts) and Android
/// (MessagePadding.kt): 4-byte big-endian length prefix, plaintext, random
/// fill to a multiple of 256.
final class MessagePaddingTests: XCTestCase {

    func testRoundTripShortMessage() {
        let plaintext = Data("ok".utf8)
        let padded = MessagePadding.pad(plaintext)
        XCTAssertEqual(padded.count, MessagePadding.blockBytes)
        XCTAssertEqual(MessagePadding.unpadOrNil(padded), plaintext)
    }

    func testRoundTripEmptyMessage() {
        let padded = MessagePadding.pad(Data())
        XCTAssertEqual(padded.count, MessagePadding.blockBytes)
        XCTAssertEqual(MessagePadding.unpadOrNil(padded), Data())
    }

    func testExactBoundaryRollsToNextBlock() {
        // 252 bytes + 4-byte prefix == exactly one block.
        let exact = Data(repeating: 0x41, count: MessagePadding.blockBytes - 4)
        XCTAssertEqual(MessagePadding.pad(exact).count, MessagePadding.blockBytes)
        // One more byte spills into the second block.
        let spill = Data(repeating: 0x41, count: MessagePadding.blockBytes - 3)
        XCTAssertEqual(MessagePadding.pad(spill).count, MessagePadding.blockBytes * 2)
    }

    func testLengthPrefixIsBigEndian() {
        let plaintext = Data(repeating: 0x42, count: 258)
        let padded = MessagePadding.pad(plaintext)
        XCTAssertEqual([UInt8](padded.prefix(4)), [0x00, 0x00, 0x01, 0x02])
    }

    func testUnpadRejectsCorruptLength() {
        // Claims 300 bytes of body inside a 256-byte block.
        var corrupt = MessagePadding.pad(Data("hi".utf8))
        corrupt[0] = 0x00; corrupt[1] = 0x00; corrupt[2] = 0x01; corrupt[3] = 0x2C
        XCTAssertNil(MessagePadding.unpadOrNil(corrupt))
    }

    func testUnpadRejectsTooShortInput() {
        XCTAssertNil(MessagePadding.unpadOrNil(Data([0x00, 0x01])))
    }

    /// Legacy (pre-padding) UTF-8 text never begins with a NUL byte, so it
    /// can only alias a valid padded block by accident if it does — the
    /// fallback contract receive() relies on.
    func testLegacyTextIsNotValidPadding() {
        let legacy = Data("hello from a pre-padding client".utf8)
        XCTAssertNil(MessagePadding.unpadOrNil(legacy))
    }

    /// A real padded blob is always a non-empty multiple of blockBytes, so
    /// anything else must fall through as legacy — even with a plausible
    /// length prefix (a NUL-prefixed legacy message must not be truncated
    /// to a zero-length "unpadded" result).
    func testNonBlockMultipleIsLegacyEvenWithPlausiblePrefix() {
        var blob = Data([0x00, 0x00, 0x00, 0x05])
        blob.append(Data(repeating: 0x41, count: 296))  // 300 bytes total
        XCTAssertNil(MessagePadding.unpadOrNil(blob))
        let nulPrefixedLegacy = Data([0x00, 0x00, 0x00, 0x00]) + Data("text".utf8)
        XCTAssertNil(MessagePadding.unpadOrNil(nulPrefixedLegacy))
    }
}
