// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// Wire-format message envelope. Field names and types MUST match
/// packages/protocol message_envelope_schema exactly (snake_case JSON).
/// The server only ever sees this envelope — ciphertext and routing data,
/// never content.
public struct MessageEnvelope: Codable, Equatable, Identifiable {
    public static let currentVersion = "1"

    /// UUID v4 string.
    public let id: String
    public let senderID: String
    public let recipientID: String
    /// Base64-encoded Signal Protocol ciphertext.
    public let ciphertext: String
    /// Base64 Curve25519 public key — present on X3DH session-initiating
    /// (prekey) messages only, null afterwards.
    public let ephemeralKey: String?
    public let prekeyID: Int?
    /// Double Ratchet sending-chain counter.
    public let messageNumber: Int
    public let previousChainLength: Int
    /// ISO 8601 UTC timestamp.
    public let timestamp: String
    /// Seconds until self-destruct; null means no self-destruct.
    public let ttlSeconds: Int?
    public let burnOnRead: Bool
    /// "text" | "image" | "file"
    public let mediaType: MediaType
    /// Always "1" for this protocol version.
    public let version: String

    public enum MediaType: String, Codable {
        case text
        case image
        case file
    }

    enum CodingKeys: String, CodingKey {
        case id
        case senderID = "sender_id"
        case recipientID = "recipient_id"
        case ciphertext
        case ephemeralKey = "ephemeral_key"
        case prekeyID = "prekey_id"
        case messageNumber = "message_number"
        case previousChainLength = "previous_chain_length"
        case timestamp
        case ttlSeconds = "ttl_seconds"
        case burnOnRead = "burn_on_read"
        case mediaType = "media_type"
        case version
    }

    public init(id: String = UUID().uuidString.lowercased(),
                senderID: String,
                recipientID: String,
                ciphertext: String,
                ephemeralKey: String? = nil,
                prekeyID: Int? = nil,
                messageNumber: Int,
                previousChainLength: Int,
                timestamp: String = MessageEnvelope.isoTimestamp(),
                ttlSeconds: Int? = nil,
                burnOnRead: Bool = false,
                mediaType: MediaType = .text,
                version: String = MessageEnvelope.currentVersion) {
        self.id = id
        self.senderID = senderID
        self.recipientID = recipientID
        self.ciphertext = ciphertext
        self.ephemeralKey = ephemeralKey
        self.prekeyID = prekeyID
        self.messageNumber = messageNumber
        self.previousChainLength = previousChainLength
        self.timestamp = timestamp
        self.ttlSeconds = ttlSeconds
        self.burnOnRead = burnOnRead
        self.mediaType = mediaType
        self.version = version
    }

    public static func isoTimestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    public var timestampDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: timestamp) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: timestamp)
    }
}
