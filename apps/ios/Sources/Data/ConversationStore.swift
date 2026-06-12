// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// A contact, discovered via QR code or direct link only — no phone number,
/// no email, no name required. The routing ID is a UUID.
public struct Contact: Identifiable, Equatable {
    public let id: UUID
    /// Optional display name, local-only, never used for routing.
    public var displayName: String
    /// The contact's public Curve25519 identity key (with libsignal type byte).
    public var identityKey: Data
    /// True after the user has compared safety numbers (in person or via QR).
    public var verified: Bool
    /// Set when the server hands us a different identity key than the one we
    /// verified — surfaces the "Key changed — verify identity" warning.
    public var identityKeyChanged: Bool

    public init(id: UUID,
                displayName: String,
                identityKey: Data,
                verified: Bool = false,
                identityKeyChanged: Bool = false) {
        self.id = id
        self.displayName = displayName
        self.identityKey = identityKey
        self.verified = verified
        self.identityKeyChanged = identityKeyChanged
    }
}

public struct Conversation: Identifiable, Equatable {
    public var id: UUID { contact.id }
    public var contact: Contact
    public var lastActivity: Date?
    public var unreadCount: Int

    public init(contact: Contact, lastActivity: Date? = nil, unreadCount: Int = 0) {
        self.contact = contact
        self.lastActivity = lastActivity
        self.unreadCount = unreadCount
    }
}

/// QR-code contact exchange payload. Versioned so future fields can be added.
public struct ContactExchangePayload: Codable {
    public let version: String
    public let accountID: String
    public let identityKey: String // base64

    enum CodingKeys: String, CodingKey {
        case version
        case accountID = "account_id"
        case identityKey = "identity_key"
    }
}

/// In-memory conversation/contact registry. Holds no message content; contact
/// records contain only public keys and a local display name. Nothing here is
/// written to disk — restart means re-sync, by design (nothing lasts).
@MainActor
public final class ConversationStore: ObservableObject {
    @Published public private(set) var conversations: [Conversation] = []

    public init() {}

    public var sorted: [Conversation] {
        conversations.sorted {
            ($0.lastActivity ?? .distantPast) > ($1.lastActivity ?? .distantPast)
        }
    }

    public func conversation(for contactID: UUID) -> Conversation? {
        conversations.first { $0.id == contactID }
    }

    // MARK: - Contact lifecycle

    /// Adds a contact from a scanned QR payload (JSON of ContactExchangePayload).
    @discardableResult
    public func addContact(fromQRPayload payload: String, displayName: String) -> Contact? {
        guard
            let data = payload.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(ContactExchangePayload.self, from: data),
            let id = UUID(uuidString: decoded.accountID),
            let key = Data(base64Encoded: decoded.identityKey)
        else { return nil }
        let contact = Contact(id: id, displayName: displayName, identityKey: key)
        upsert(contact)
        return contact
    }

    public func upsert(_ contact: Contact) {
        if let index = conversations.firstIndex(where: { $0.id == contact.id }) {
            conversations[index].contact = contact
        } else {
            conversations.append(Conversation(contact: contact))
        }
    }

    public func markVerified(_ contactID: UUID) {
        guard let index = conversations.firstIndex(where: { $0.id == contactID }) else { return }
        conversations[index].contact.verified = true
        conversations[index].contact.identityKeyChanged = false
    }

    /// Called when an inbound identity key does not match the stored one.
    public func flagIdentityKeyChange(_ contactID: UUID, newKey: Data) {
        guard let index = conversations.firstIndex(where: { $0.id == contactID }) else { return }
        conversations[index].contact.identityKey = newKey
        conversations[index].contact.verified = false
        conversations[index].contact.identityKeyChanged = true
    }

    // MARK: - Activity bookkeeping

    public func noteActivity(contactID: UUID, at date: Date = Date(), incrementUnread: Bool) {
        guard let index = conversations.firstIndex(where: { $0.id == contactID }) else { return }
        conversations[index].lastActivity = date
        if incrementUnread { conversations[index].unreadCount += 1 }
    }

    public func clearUnread(contactID: UUID) {
        guard let index = conversations.firstIndex(where: { $0.id == contactID }) else { return }
        conversations[index].unreadCount = 0
    }

    public func remove(contactID: UUID) {
        conversations.removeAll { $0.id == contactID }
    }
}
