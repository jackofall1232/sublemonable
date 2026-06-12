// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Starscream

/// Authenticated WebSocket (WS /ws) for real-time delivery, built on
/// Starscream with the same certificate pin as the REST client.
///
/// Events per server.websocket_events:
///   client→server: message.send, message.ack, message.burn,
///                  typing.start, typing.stop, presence.update
///   server→client: message.deliver, message.burned, prekey.low,
///                  session.revoked, error
///
/// `message.ack` is the contractual trigger for SERVER-SIDE DELETION: the
/// instant we acknowledge delivery, the server purges its envelope copy.
public final class WebSocketClient: NSObject {
    public enum Outbound {
        case messageSend(MessageEnvelope)
        case messageAck(messageID: String)
        case messageBurn(messageID: String)
        case typingStart(recipientID: String)
        case typingStop(recipientID: String)
        case presenceUpdate(online: Bool)

        var type: String {
            switch self {
            case .messageSend: return "message.send"
            case .messageAck: return "message.ack"
            case .messageBurn: return "message.burn"
            case .typingStart: return "typing.start"
            case .typingStop: return "typing.stop"
            case .presenceUpdate: return "presence.update"
            }
        }
    }

    public enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
    }

    // MARK: Inbound event handlers (wired by the stores at app start)

    public var onMessageDeliver: ((MessageEnvelope) -> Void)?
    public var onMessageBurned: ((String) -> Void)?
    public var onPreKeyLow: (() -> Void)?
    public var onSessionRevoked: (() -> Void)?
    public var onStateChange: ((ConnectionState) -> Void)?

    public private(set) var state: ConnectionState = .disconnected {
        didSet { onStateChange?(state) }
    }

    private var socket: WebSocket?
    private let url: URL
    private var reconnectAttempts = 0
    private var intentionalDisconnect = false
    private var accessTokenProvider: (() async -> String?)?

    public init(url: URL = WebSocketClient.defaultURL) {
        self.url = url
        super.init()
    }

    public static let defaultURL = URL(string: "wss://api.sublemonable.example/ws")!

    public func setAccessTokenProvider(_ provider: @escaping () async -> String?) {
        accessTokenProvider = provider
    }

    // MARK: - Connection lifecycle

    public func connect() {
        guard state == .disconnected else { return }
        state = .connecting
        intentionalDisconnect = false
        Task { [weak self] in
            guard let self else { return }
            let token = await self.accessTokenProvider?() ?? nil
            await MainActor.run { self.openSocket(token: token) }
        }
    }

    private func openSocket(token: String?) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        // Same SHA-256 leaf-certificate pin as the REST stack.
        let socket = WebSocket(request: request, certPinner: StarscreamCertificatePinner())
        socket.delegate = self
        self.socket = socket
        socket.connect()
    }

    public func disconnect() {
        intentionalDisconnect = true
        socket?.disconnect()
        socket = nil
        state = .disconnected
    }

    private func scheduleReconnect() {
        guard !intentionalDisconnect else { return }
        state = .disconnected
        reconnectAttempts += 1
        // Exponential backoff: 1s, 2s, 4s … capped at 30s.
        let delay = min(30.0, pow(2.0, Double(reconnectAttempts - 1)))
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }

    // MARK: - Sending

    private struct OutboundFrame<P: Encodable>: Encodable {
        let type: String
        let payload: P
    }

    private struct MessageIDPayload: Encodable {
        let messageID: String
        enum CodingKeys: String, CodingKey { case messageID = "message_id" }
    }

    private struct RecipientPayload: Encodable {
        let recipientID: String
        enum CodingKeys: String, CodingKey { case recipientID = "recipient_id" }
    }

    private struct PresencePayload: Encodable {
        let online: Bool
    }

    public func send(_ outbound: Outbound) throws {
        let data: Data
        switch outbound {
        case let .messageSend(envelope):
            data = try JSONEncoder().encode(OutboundFrame(type: outbound.type, payload: envelope))
        case let .messageAck(id), let .messageBurn(id):
            data = try JSONEncoder().encode(
                OutboundFrame(type: outbound.type, payload: MessageIDPayload(messageID: id))
            )
        case let .typingStart(recipient), let .typingStop(recipient):
            data = try JSONEncoder().encode(
                OutboundFrame(type: outbound.type, payload: RecipientPayload(recipientID: recipient))
            )
        case let .presenceUpdate(online):
            data = try JSONEncoder().encode(
                OutboundFrame(type: outbound.type, payload: PresencePayload(online: online))
            )
        }
        socket?.write(string: String(decoding: data, as: UTF8.self))
    }

    // MARK: - Receiving

    private struct InboundFrame: Decodable {
        let type: String
    }

    private struct InboundEnvelopeFrame: Decodable {
        let payload: MessageEnvelope
    }

    private struct InboundMessageIDFrame: Decodable {
        struct Payload: Decodable {
            let messageID: String
            enum CodingKeys: String, CodingKey { case messageID = "message_id" }
        }
        let payload: Payload
    }

    private func handle(text: String) {
        let data = Data(text.utf8)
        guard let frame = try? JSONDecoder().decode(InboundFrame.self, from: data) else { return }
        switch frame.type {
        case "message.deliver":
            guard let envelopeFrame = try? JSONDecoder()
                .decode(InboundEnvelopeFrame.self, from: data) else { return }
            // Decryption + the delivery ack (→ server-side deletion) happen
            // in MessageStore.receive.
            onMessageDeliver?(envelopeFrame.payload)
        case "message.burned":
            guard let idFrame = try? JSONDecoder()
                .decode(InboundMessageIDFrame.self, from: data) else { return }
            onMessageBurned?(idFrame.payload.messageID)
        case "prekey.low":
            onPreKeyLow?()
        case "session.revoked":
            intentionalDisconnect = true
            socket?.disconnect()
            state = .disconnected
            onSessionRevoked?()
        case "error":
            // Server errors carry no user data; nothing is logged client-side
            // either — content-adjacent payloads must never reach a log.
            break
        default:
            break
        }
    }
}

// MARK: - Starscream delegate

extension WebSocketClient: WebSocketDelegate {
    public func didReceive(event: WebSocketEvent, client: WebSocketClient_TypeAlias) {
        switch event {
        case .connected:
            state = .connected
            reconnectAttempts = 0
            try? send(.presenceUpdate(online: true))
        case .disconnected, .cancelled:
            scheduleReconnect()
        case let .text(text):
            handle(text: text)
        case let .binary(data):
            handle(text: String(decoding: data, as: UTF8.self))
        case .error:
            scheduleReconnect()
        case .reconnectSuggested:
            socket?.disconnect()
            scheduleReconnect()
        case .viabilityChanged, .ping, .pong, .peerClosed:
            break
        }
    }
}

/// Starscream 4 names the delegate's client parameter type `WebSocketClient`,
/// which collides with our class name; alias the Starscream protocol type.
public typealias WebSocketClient_TypeAlias = Starscream.WebSocketClient

/// Starscream-side certificate pinning, delegating to the shared
/// CertificatePin (SHA-256 of the leaf certificate, TLS 1.3 underneath).
public final class StarscreamCertificatePinner: CertificatePinning {
    public init() {}
    public func evaluateTrust(trust: SecTrust,
                              domain: String?,
                              completion: ((PinningState) -> Void)) {
        if CertificatePin.evaluate(trust: trust) {
            completion(.success)
        } else {
            completion(.failed(nil))
        }
    }
}
