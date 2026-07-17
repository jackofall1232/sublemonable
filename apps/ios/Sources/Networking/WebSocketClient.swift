// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Starscream

/// Authenticated WebSocket (WS /ws) for real-time delivery, built on
/// Starscream with the same certificate pin as the REST client.
///
/// WIRE CONTRACT — must stay byte-compatible with the server
/// (server/internal/ws/hub.go) and packages/protocol/src/events.ts. Frames
/// are FLAT: every field sits next to "type" at the top level — there is NO
/// "payload" wrapper. (Pre-fix iOS spoke a nested {type, payload} shape the
/// server has never spoken — the same defect Android shipped in v1.5.3;
/// see .l00prite/ledger.md and PR #23.)
///
///   client → server: {"type":"message.send","envelope":{...}}
///                    {"type":"message.ack","message_id":...}
///                    {"type":"message.burn","message_id":...,"peer_id":...}
///                    {"type":"typing.start"/"typing.stop","peer_id":...}
///   server → client: {"type":"message.deliver","envelope":{...}}
///                    {"type":"message.burned","message_id":...,"peer_id":...}
///                    {"type":"prekey.low","remaining":...}
///                    {"type":"session.revoked"} / {"type":"error","code":...}
///
/// presence.update is deliberately NOT implemented (mirroring Android): the
/// server's relaySignal routes by a peer_id the presence event does not
/// define, so every presence frame is silently dropped server-side today —
/// a stub would only pin a dead, wrong shape.
///
/// Handshake auth: the JWT rides the Sec-WebSocket-Protocol request header —
/// the only header the server's /ws middleware reads (an Authorization
/// header is IGNORED there — the pre-fix bug; the ?token= fallback would put
/// the token in URLs, which proxies love to log). The server echoes the
/// offered subprotocol per RFC 6455; Starscream forwards the request header
/// verbatim and does not require the echo, so both directions are safe.
///
/// `message.ack` is the contractual trigger for SERVER-SIDE DELETION: the
/// instant we acknowledge delivery, the server purges its envelope copy.
public final class WebSocketClient: NSObject {
    public enum Outbound {
        case messageSend(MessageEnvelope)
        case messageAck(messageID: String)
        /// `peerID` routes the burn notification to the other side — the
        /// server rejects a burn without it (`bad_peer`).
        case messageBurn(messageID: String, peerID: String)
        case typingStart(peerID: String)
        case typingStop(peerID: String)

        var type: String {
            switch self {
            case .messageSend: return "message.send"
            case .messageAck: return "message.ack"
            case .messageBurn: return "message.burn"
            case .typingStart: return "typing.start"
            case .typingStop: return "typing.stop"
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
    /// The JWT was rejected during the WebSocket handshake (401/403).
    /// Reconnecting with the same dead token would spin forever (JWTs live
    /// 15 min), so the app re-authenticates and calls `connect()` with a
    /// fresh token instead of the socket retrying on its own — same hand-off
    /// Android's WsClient makes to its coordinator.
    public var onAuthExpired: (() -> Void)?

    /// Privacy-safe lifecycle diagnostics sink (BootDiagnostics.record).
    /// Fixed stage strings + error class + HTTP status only — never tokens,
    /// frame contents, account ids, or URLs.
    public var diag: (String) -> Void = { _ in }

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

    public static let defaultURL = URL(string: "wss://relay.sublemonable.com/ws")!

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
            // The server's /ws middleware authenticates from THIS header (or
            // a ?token= query param) — NOT Authorization, which it never
            // reads. Starscream's upgrade builder copies custom request
            // headers verbatim (HTTPWSHeader.createUpgrade only sets its own
            // Upgrade/Connection/Key/Version/Origin/Host fields).
            request.setValue(token, forHTTPHeaderField: "Sec-WebSocket-Protocol")
        }
        diag("ws[\(reconnectAttempts)]: firing WS /ws handshake")
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

    // MARK: - Sending (flat frames — see the wire contract in the class doc)

    private struct MessageSendFrame: Encodable {
        let type: String
        let envelope: MessageEnvelope
    }

    private struct MessageIDFrame: Encodable {
        let type: String
        let messageID: String
        enum CodingKeys: String, CodingKey {
            case type
            case messageID = "message_id"
        }
    }

    private struct MessageBurnFrame: Encodable {
        let type: String
        let messageID: String
        let peerID: String
        enum CodingKeys: String, CodingKey {
            case type
            case messageID = "message_id"
            case peerID = "peer_id"
        }
    }

    private struct PeerIDFrame: Encodable {
        let type: String
        let peerID: String
        enum CodingKeys: String, CodingKey {
            case type
            case peerID = "peer_id"
        }
    }

    public func send(_ outbound: Outbound) throws {
        let data: Data
        switch outbound {
        case let .messageSend(envelope):
            data = try JSONEncoder().encode(
                MessageSendFrame(type: outbound.type, envelope: envelope))
        case let .messageAck(id):
            data = try JSONEncoder().encode(
                MessageIDFrame(type: outbound.type, messageID: id))
        case let .messageBurn(id, peerID):
            data = try JSONEncoder().encode(
                MessageBurnFrame(type: outbound.type, messageID: id, peerID: peerID))
        case let .typingStart(peerID), let .typingStop(peerID):
            data = try JSONEncoder().encode(
                PeerIDFrame(type: outbound.type, peerID: peerID))
        }
        socket?.write(string: String(decoding: data, as: UTF8.self))
    }

    // MARK: - Receiving (flat frames)

    private struct InboundFrame: Decodable {
        let type: String
        let envelope: MessageEnvelope?
        let messageID: String?
        let remaining: Int?
        let code: String?
        enum CodingKeys: String, CodingKey {
            case type
            case envelope
            case messageID = "message_id"
            case remaining
            case code
        }
    }

    private func handle(text: String) {
        let data = Data(text.utf8)
        guard let frame = try? JSONDecoder().decode(InboundFrame.self, from: data) else { return }
        switch frame.type {
        case "message.deliver":
            // Decryption + the delivery ack (→ server-side deletion) happen
            // in MessageStore.receive.
            guard let envelope = frame.envelope else { return }
            onMessageDeliver?(envelope)
        case "message.burned":
            // A malformed frame (missing/empty id) is dropped, not dispatched.
            guard let id = frame.messageID, !id.isEmpty else { return }
            onMessageBurned?(id)
        case "prekey.low":
            // A real low-stock event always carries "remaining" (the server
            // serializes it even at 0); absent means malformed, and a spurious
            // dispatch would trigger a needless prekey upload.
            guard frame.remaining != nil else { return }
            onPreKeyLow?()
        case "session.revoked":
            intentionalDisconnect = true
            socket?.disconnect()
            state = .disconnected
            onSessionRevoked?()
        case "error":
            // Server error codes are fixed-vocabulary schema strings, never
            // content — safe for diagnostics (frame contents are NOT).
            diag("ws: server error code=\(frame.code ?? "unknown")")
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
            diag("ws: connected")
        case let .disconnected(_, code):
            // Close code only — a close reason is server/proxy-controlled text.
            diag("ws: closed code=\(code)")
            scheduleReconnect()
        case .cancelled:
            scheduleReconnect()
        case let .text(text):
            handle(text: text)
        case let .binary(data):
            handle(text: String(decoding: data, as: UTF8.self))
        case let .error(error):
            // A rejected token (JWTs live 15 min) would make every socket-level
            // retry a fresh 401 forever. Hand back to the app to re-authenticate
            // instead of scheduling a doomed reconnect. Starscream surfaces a
            // failed upgrade as HTTPUpgradeError.notAnUpgrade(status, headers).
            if let upgradeError = error as? HTTPUpgradeError,
               case let .notAnUpgrade(status, _) = upgradeError,
               status == 401 || status == 403 {
                diag("ws: token rejected (http_status=\(status)) — handing off to re-auth")
                intentionalDisconnect = true
                state = .disconnected
                onAuthExpired?()
                return
            }
            // Error class + HTTP status only (pin failure vs TLS vs unreachable
            // vs a rejected handshake) — never the token, URL, or body.
            diag("ws: handshake/stream failed: \(describeForDiagnostics(error))")
            scheduleReconnect()
        case .reconnectSuggested:
            socket?.disconnect()
            scheduleReconnect()
        case .viabilityChanged, .ping, .pong, .peerClosed:
            break
        }
    }

    /// Privacy-safe error description: type name plus, for the well-known
    /// transport error kinds, their numeric code. Never interpolates
    /// server-controlled strings, URLs, or tokens.
    private func describeForDiagnostics(_ error: Error?) -> String {
        guard let error else { return "unknown" }
        if let upgradeError = error as? HTTPUpgradeError,
           case let .notAnUpgrade(status, _) = upgradeError {
            return "HTTPUpgradeError.notAnUpgrade http_status=\(status)"
        }
        let nsError = error as NSError
        return "\(type(of: error)) domain=\(nsError.domain) code=\(nsError.code)"
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
