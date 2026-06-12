// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Combine

/// A decrypted message. EXISTS IN MEMORY ONLY — plaintext is never written to
/// disk, never logged, and is destroyed when its TTL expires, when it is
/// burned, or when the process ends.
public struct Message: Identifiable, Equatable {
    public enum State: Equatable {
        case sending
        case sent
        case delivered
        case opened
        /// Particle-dissolve animation in flight (600ms); plaintext is purged
        /// the moment it completes.
        case burning
    }

    public let id: UUID
    public let conversationID: UUID
    public let text: String
    public let isOutgoing: Bool
    public let sentAt: Date
    public let ttlSeconds: Int?
    public let burnOnRead: Bool
    public var deliveredAt: Date?
    public var state: State

    /// TTL countdown starts on delivery (timer_starts: on_delivery).
    public var expiresAt: Date? {
        guard let ttlSeconds, let deliveredAt else { return nil }
        return deliveredAt.addingTimeInterval(TimeInterval(ttlSeconds))
    }

    public init(id: UUID = UUID(),
                conversationID: UUID,
                text: String,
                isOutgoing: Bool,
                sentAt: Date = Date(),
                ttlSeconds: Int? = nil,
                burnOnRead: Bool = false,
                deliveredAt: Date? = nil,
                state: State = .sending) {
        self.id = id
        self.conversationID = conversationID
        self.text = text
        self.isOutgoing = isOutgoing
        self.sentAt = sentAt
        self.ttlSeconds = ttlSeconds
        self.burnOnRead = burnOnRead
        self.deliveredAt = deliveredAt
        self.state = state
    }
}

/// In-memory store of decrypted messages with ephemeral-messaging enforcement:
///
/// - Delivery ack → server purges its envelope copy immediately.
/// - TTL → local plaintext destroyed when the timer fires (both sides).
/// - Burn-on-read → destroyed right after first open; the peer is notified
///   via the `message.burn` WebSocket event so their copy dies too.
@MainActor
public final class MessageStore: ObservableObject {
    @Published public private(set) var messagesByConversation: [UUID: [Message]] = [:]

    private var ttlTasks: [UUID: Task<Void, Never>] = [:]
    private let signal: SignalManager
    private let socket: WebSocketClient
    private let conversations: ConversationStore

    /// Fired on every inbound message — carries NO content and NO sender.
    /// The app layer uses it to post the fixed "New message" notification
    /// when backgrounded.
    public var onInboundMessage: (() -> Void)?

    public init(signal: SignalManager,
                socket: WebSocketClient,
                conversations: ConversationStore) {
        self.signal = signal
        self.socket = socket
        self.conversations = conversations

        socket.onMessageDeliver = { [weak self] envelope in
            Task { @MainActor in self?.receive(envelope: envelope) }
        }
        socket.onMessageBurned = { [weak self] messageID in
            Task { @MainActor in self?.handleRemoteBurn(messageID: messageID) }
        }
    }

    public func messages(for conversationID: UUID) -> [Message] {
        messagesByConversation[conversationID] ?? []
    }

    // MARK: - Sending

    public func send(text: String,
                     to contact: Contact,
                     ttlSeconds: Int?,
                     burnOnRead: Bool) async {
        var message = Message(conversationID: contact.id,
                              text: text,
                              isOutgoing: true,
                              ttlSeconds: ttlSeconds,
                              burnOnRead: burnOnRead)
        append(message)

        do {
            let envelope = try await signal.encrypt(
                plaintext: Data(text.utf8),
                for: contact,
                messageID: message.id,
                ttlSeconds: ttlSeconds,
                burnOnRead: burnOnRead
            )
            try socket.send(.messageSend(envelope))
            message.state = .sent
            // Sender-side TTL mirrors the recipient's (enforced_both_sides).
            message.deliveredAt = Date()
            update(message)
            scheduleTTLDestruction(for: message)
        } catch {
            // Encryption/transport failure — never log content, only state.
            remove(messageID: message.id, conversationID: contact.id)
        }
        conversations.noteActivity(contactID: contact.id, incrementUnread: false)
    }

    // MARK: - Receiving

    public func receive(envelope: MessageEnvelope) {
        guard let senderID = UUID(uuidString: envelope.senderID) else { return }
        do {
            let plaintext = try signal.decrypt(envelope: envelope)
            let message = Message(
                id: UUID(uuidString: envelope.id) ?? UUID(),
                conversationID: senderID,
                text: String(decoding: plaintext, as: UTF8.self),
                isOutgoing: false,
                sentAt: envelope.timestampDate ?? Date(),
                ttlSeconds: envelope.ttlSeconds,
                burnOnRead: envelope.burnOnRead,
                deliveredAt: Date(),
                state: .delivered
            )
            append(message)
            scheduleTTLDestruction(for: message)
            conversations.noteActivity(contactID: senderID, incrementUnread: true)
            onInboundMessage?()
        } catch {
            // Undecryptable envelope (e.g. stale session). Dropped silently —
            // content is unknown by definition and must not be logged.
        }
        // Ack delivery regardless: the server deletes its copy immediately.
        try? socket.send(.messageAck(messageID: envelope.id))
    }

    // MARK: - Burn-on-read

    /// Called when the recipient opens a burn-on-read message. Starts the
    /// 600ms particle dissolve; destruction follows from the animation's
    /// completion callback (burnAnimationFinished).
    public func markOpened(messageID: UUID, conversationID: UUID) {
        guard var message = find(messageID: messageID, conversationID: conversationID),
              message.state != .burning else { return }
        message.state = message.burnOnRead ? .burning : .opened
        update(message)
        if message.burnOnRead {
            // Tell the network the message burned, so the sender's copy and
            // any server residue are destroyed as well.
            try? socket.send(.messageBurn(messageID: messageID.uuidString.lowercased()))
        }
    }

    /// Completion of the particle dissolve — the plaintext dies here.
    public func burnAnimationFinished(messageID: UUID, conversationID: UUID) {
        remove(messageID: messageID, conversationID: conversationID)
    }

    /// The peer burned a message (burn-on-read opened, or burned early).
    public func handleRemoteBurn(messageID: String) {
        guard let id = UUID(uuidString: messageID) else { return }
        for (conversationID, messages) in messagesByConversation
        where messages.contains(where: { $0.id == id }) {
            beginBurn(messageID: id, conversationID: conversationID)
        }
    }

    /// "Burn all" chat header action: every message in the conversation goes
    /// through the dissolve and is destroyed, and the peer is notified.
    public func burnAll(conversationID: UUID) {
        for message in messages(for: conversationID) {
            try? socket.send(.messageBurn(messageID: message.id.uuidString.lowercased()))
            beginBurn(messageID: message.id, conversationID: conversationID)
        }
    }

    private func beginBurn(messageID: UUID, conversationID: UUID) {
        guard var message = find(messageID: messageID, conversationID: conversationID),
              message.state != .burning else { return }
        message.state = .burning
        update(message)
        // Failsafe: even if the bubble is off-screen and never reports its
        // animation finishing, the plaintext is purged after the 600ms burn.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Motion.dramatic * 1.5 * 1_000_000_000))
            await self?.burnAnimationFinished(messageID: messageID, conversationID: conversationID)
        }
    }

    // MARK: - TTL enforcement

    private func scheduleTTLDestruction(for message: Message) {
        guard let expiresAt = message.expiresAt else { return }
        ttlTasks[message.id]?.cancel()
        let messageID = message.id
        let conversationID = message.conversationID
        ttlTasks[message.id] = Task { [weak self] in
            let interval = expiresAt.timeIntervalSinceNow
            if interval > 0 {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
            guard !Task.isCancelled else { return }
            await self?.beginBurn(messageID: messageID, conversationID: conversationID)
        }
    }

    // MARK: - Collection plumbing

    private func append(_ message: Message) {
        messagesByConversation[message.conversationID, default: []].append(message)
    }

    private func update(_ message: Message) {
        guard let index = messagesByConversation[message.conversationID]?
            .firstIndex(where: { $0.id == message.id }) else { return }
        messagesByConversation[message.conversationID]?[index] = message
    }

    private func find(messageID: UUID, conversationID: UUID) -> Message? {
        messagesByConversation[conversationID]?.first { $0.id == messageID }
    }

    private func remove(messageID: UUID, conversationID: UUID) {
        ttlTasks[messageID]?.cancel()
        ttlTasks[messageID] = nil
        messagesByConversation[conversationID]?.removeAll { $0.id == messageID }
    }

    /// Panic wipe — destroys every decrypted message in memory.
    public func wipeAll() {
        ttlTasks.values.forEach { $0.cancel() }
        ttlTasks.removeAll()
        messagesByConversation.removeAll()
    }
}
