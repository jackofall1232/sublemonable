// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import Sublemonable

/// The envelope's JSON shape is a wire contract shared with packages/protocol
/// and the Go server — these tests pin the exact snake_case field names.
final class MessageEnvelopeTests: XCTestCase {
    private func makeEnvelope() -> MessageEnvelope {
        MessageEnvelope(
            id: "2c8e3f8a-1111-4222-8333-444455556666",
            senderID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            recipientID: "11111111-2222-4333-8444-555555555555",
            ciphertext: "Y2lwaGVydGV4dA==",
            ephemeralKey: "BWVwaGVtZXJhbA==",
            prekeyID: 42,
            messageNumber: 7,
            previousChainLength: 3,
            timestamp: "2026-06-12T10:00:00.000Z",
            ttlSeconds: 300,
            burnOnRead: true,
            mediaType: .text,
            version: "1"
        )
    }

    // MARK: Round trip

    func testEncodeDecodeRoundTripPreservesAllFields() throws {
        let original = makeEnvelope()
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MessageEnvelope.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testRoundTripWithNullOptionals() throws {
        let original = MessageEnvelope(
            senderID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            recipientID: "11111111-2222-4333-8444-555555555555",
            ciphertext: "Y2lwaGVydGV4dA==",
            ephemeralKey: nil,
            prekeyID: nil,
            messageNumber: 0,
            previousChainLength: 0,
            ttlSeconds: nil
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MessageEnvelope.self, from: data)
        XCTAssertEqual(decoded, original)
        XCTAssertNil(decoded.ephemeralKey)
        XCTAssertNil(decoded.prekeyID)
        XCTAssertNil(decoded.ttlSeconds)
    }

    // MARK: Exact wire field names (snake_case, per packages/protocol)

    func testJSONUsesExactSnakeCaseProtocolFieldNames() throws {
        let data = try JSONEncoder().encode(makeEnvelope())
        let object = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any])

        let expectedKeys: Set<String> = [
            "id", "sender_id", "recipient_id", "ciphertext", "ephemeral_key",
            "prekey_id", "message_number", "previous_chain_length",
            "timestamp", "ttl_seconds", "burn_on_read", "media_type", "version"
        ]
        XCTAssertEqual(Set(object.keys), expectedKeys)
    }

    func testJSONFieldValues() throws {
        let data = try JSONEncoder().encode(makeEnvelope())
        let object = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["sender_id"] as? String,
                       "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
        XCTAssertEqual(object["recipient_id"] as? String,
                       "11111111-2222-4333-8444-555555555555")
        XCTAssertEqual(object["prekey_id"] as? Int, 42)
        XCTAssertEqual(object["message_number"] as? Int, 7)
        XCTAssertEqual(object["previous_chain_length"] as? Int, 3)
        XCTAssertEqual(object["ttl_seconds"] as? Int, 300)
        XCTAssertEqual(object["burn_on_read"] as? Bool, true)
        XCTAssertEqual(object["media_type"] as? String, "text")
        XCTAssertEqual(object["version"] as? String, "1")
    }

    func testDecodesServerProducedJSON() throws {
        let json = """
        {
          "id": "2c8e3f8a-1111-4222-8333-444455556666",
          "sender_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          "recipient_id": "11111111-2222-4333-8444-555555555555",
          "ciphertext": "Y2lwaGVydGV4dA==",
          "ephemeral_key": null,
          "prekey_id": null,
          "message_number": 12,
          "previous_chain_length": 4,
          "timestamp": "2026-06-12T10:00:00Z",
          "ttl_seconds": 86400,
          "burn_on_read": false,
          "media_type": "image",
          "version": "1"
        }
        """
        let envelope = try JSONDecoder().decode(MessageEnvelope.self,
                                                from: Data(json.utf8))
        XCTAssertEqual(envelope.messageNumber, 12)
        XCTAssertEqual(envelope.mediaType, .image)
        XCTAssertNil(envelope.ephemeralKey)
        XCTAssertEqual(envelope.ttlSeconds, 86400)
        XCTAssertNotNil(envelope.timestampDate)
    }

    // MARK: Defaults

    func testDefaultsMatchProtocolVersionOne() {
        let envelope = MessageEnvelope(
            senderID: "a", recipientID: "b", ciphertext: "c",
            messageNumber: 0, previousChainLength: 0)
        XCTAssertEqual(envelope.version, "1")
        XCTAssertEqual(envelope.mediaType, .text)
        XCTAssertFalse(envelope.burnOnRead)
        XCTAssertNotNil(UUID(uuidString: envelope.id), "default id must be a UUID")
    }

    func testTimestampIsISO8601UTC() {
        let envelope = makeEnvelope()
        XCTAssertNotNil(envelope.timestampDate)
        XCTAssertTrue(envelope.timestamp.hasSuffix("Z"), "timestamp must be UTC")
    }
}
