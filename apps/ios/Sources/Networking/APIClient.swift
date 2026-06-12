// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// REST client for the Sublemonable server (server.api.endpoints in the
/// master spec):
///
///   POST   /api/v1/register           — public identity key + prekeys only
///   POST   /api/v1/session            — login challenge signature → JWT
///   POST   /api/v1/session/refresh    — rotate refresh token
///   DELETE /api/v1/session            — logout
///   GET    /api/v1/users/:id/prekey   — fetch one-time prekey bundle (X3DH)
///   POST   /api/v1/prekeys            — upload a new prekey batch
///   GET    /api/v1/prekeys/count      — prekey stock check
///   DELETE /api/v1/account            — full, irreversible account deletion
///
/// Transport invariants: TLS 1.3 minimum, certificate pinned, ephemeral
/// session (no cache, no cookies, nothing on disk), no request/response
/// bodies ever logged.
public actor APIClient {
    public enum APIError: Error {
        case invalidResponse
        case http(Int)
        case notAuthenticated
        case registrationFailed
    }

    /// Self-hosters point this at their own deployment (and replace the
    /// certificate pin in PinnedSessionDelegate.swift).
    public static let defaultBaseURL = URL(string: "https://api.sublemonable.example")!

    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore

    /// Wired to SignalManager.loginSignature at app start; keeps this file
    /// free of any direct crypto dependency.
    public var loginSigner: ((UUID, Int) throws -> Data)?

    private var accessToken: String?

    private enum TokenKey {
        static let refresh = "auth.refresh-token"
    }

    public init(baseURL: URL = APIClient.defaultBaseURL,
                keychain: KeychainStore = .shared) {
        self.baseURL = baseURL
        self.keychain = keychain

        let configuration = URLSessionConfiguration.ephemeral
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv13
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.waitsForConnectivity = true
        self.session = URLSession(configuration: configuration,
                                  delegate: PinnedSessionDelegate(),
                                  delegateQueue: nil)
    }

    public func setLoginSigner(_ signer: @escaping (UUID, Int) throws -> Data) {
        loginSigner = signer
    }

    public func currentAccessToken() -> String? { accessToken }

    // MARK: - Registration

    /// Creates an account. The request carries PUBLIC keys only — the
    /// identity private key, prekey private halves, everything secret stays
    /// in the keychain.
    public func register(keys: RegistrationKeys) async throws -> UUID {
        struct Request: Encodable {
            let identityKey: String
            let registrationID: Int
            let signedPreKey: SignedPreKeyUpload
            let oneTimePreKeys: [OneTimePreKeyUpload]

            enum CodingKeys: String, CodingKey {
                case identityKey = "identity_key"
                case registrationID = "registration_id"
                case signedPreKey = "signed_prekey"
                case oneTimePreKeys = "one_time_prekeys"
            }
        }
        struct Response: Decodable {
            let accountID: String
            enum CodingKeys: String, CodingKey { case accountID = "account_id" }
        }
        let body = Request(identityKey: keys.identityKey,
                           registrationID: keys.registrationID,
                           signedPreKey: keys.signedPreKey,
                           oneTimePreKeys: keys.oneTimePreKeys)
        let response: Response = try await request(.post, "api/v1/register",
                                                   body: body, authenticated: false)
        guard let id = UUID(uuidString: response.accountID) else {
            throw APIError.registrationFailed
        }
        return id
    }

    // MARK: - Auth (JWT RS256 15min + refresh token 7d, rotated on use)

    /// Authenticates by signing the server-spec challenge:
    /// "sublemonable-login:<account_id>:<unix_ts>" (Ed25519/XEdDSA signature
    /// from the identity key).
    public func login(accountID: UUID) async throws {
        guard let loginSigner else { throw APIError.notAuthenticated }
        struct Request: Encodable {
            let accountID: String
            let timestamp: Int
            let signature: String
            enum CodingKeys: String, CodingKey {
                case accountID = "account_id"
                case timestamp
                case signature
            }
        }
        let timestamp = Int(Date().timeIntervalSince1970)
        let signature = try loginSigner(accountID, timestamp)
        let body = Request(accountID: accountID.uuidString.lowercased(),
                           timestamp: timestamp,
                           signature: signature.base64EncodedString())
        let tokens: TokenResponse = try await request(.post, "api/v1/session",
                                                      body: body, authenticated: false)
        try storeTokens(tokens)
    }

    /// Refresh-token rotation: every refresh consumes the old token and
    /// stores its replacement.
    public func refreshSession() async throws {
        guard let refreshData = try keychain.data(forKey: TokenKey.refresh),
              let refreshToken = String(data: refreshData, encoding: .utf8) else {
            throw APIError.notAuthenticated
        }
        struct Request: Encodable {
            let refreshToken: String
            enum CodingKeys: String, CodingKey { case refreshToken = "refresh_token" }
        }
        let tokens: TokenResponse = try await request(.post, "api/v1/session/refresh",
                                                      body: Request(refreshToken: refreshToken),
                                                      authenticated: false)
        try storeTokens(tokens)
    }

    public func logout() async throws {
        try await requestVoid(.delete, "api/v1/session", body: Empty?.none, authenticated: true)
        accessToken = nil
        try keychain.delete(TokenKey.refresh)
    }

    private struct TokenResponse: Decodable {
        let accessToken: String
        let refreshToken: String
        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
        }
    }

    private func storeTokens(_ tokens: TokenResponse) throws {
        accessToken = tokens.accessToken
        // Tokens are credentials, not key material: ThisDeviceOnly keychain,
        // but readable without a fresh biometric check for silent refresh.
        try keychain.set(Data(tokens.refreshToken.utf8),
                         forKey: TokenKey.refresh,
                         biometricProtected: false)
    }

    // MARK: - Prekeys

    /// Fetches a one-time prekey bundle for X3DH session establishment.
    public func fetchPreKeyBundle(for userID: UUID) async throws -> PreKeyBundleResponse {
        try await request(.get, "api/v1/users/\(userID.uuidString.lowercased())/prekey",
                          body: Empty?.none, authenticated: true)
    }

    public func uploadPreKeys(_ preKeys: [OneTimePreKeyUpload],
                              signedPreKey: SignedPreKeyUpload? = nil) async throws {
        struct Request: Encodable {
            let oneTimePreKeys: [OneTimePreKeyUpload]
            let signedPreKey: SignedPreKeyUpload?
            enum CodingKeys: String, CodingKey {
                case oneTimePreKeys = "one_time_prekeys"
                case signedPreKey = "signed_prekey"
            }
        }
        try await requestVoid(.post, "api/v1/prekeys",
                              body: Request(oneTimePreKeys: preKeys, signedPreKey: signedPreKey),
                              authenticated: true)
    }

    /// Prekey stock check — at/below the threshold the client uploads a new
    /// batch (also pushed via the prekey.low WebSocket event).
    public func preKeyCount() async throws -> Int {
        struct Response: Decodable { let count: Int }
        let response: Response = try await request(.get, "api/v1/prekeys/count",
                                                   body: Empty?.none, authenticated: true)
        return response.count
    }

    // MARK: - Account

    /// Full account deletion: purges all prekeys, pending envelopes, and the
    /// account record server-side. Irreversible.
    public func deleteAccount() async throws {
        try await requestVoid(.delete, "api/v1/account", body: Empty?.none, authenticated: true)
        accessToken = nil
        try keychain.delete(TokenKey.refresh)
    }

    // MARK: - Plumbing

    private enum Method: String {
        case get = "GET", post = "POST", delete = "DELETE"
    }

    private struct Empty: Encodable {}

    private func makeRequest<B: Encodable>(_ method: Method,
                                           _ path: String,
                                           body: B?,
                                           authenticated: Bool) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authenticated {
            guard let accessToken else { throw APIError.notAuthenticated }
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        return request
    }

    /// Executes a request; on 401 it rotates the refresh token once and
    /// retries before failing.
    private func execute<B: Encodable>(_ method: Method,
                                       _ path: String,
                                       body: B?,
                                       authenticated: Bool) async throws -> Data {
        var attempt = 0
        while true {
            let request = try makeRequest(method, path, body: body, authenticated: authenticated)
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
            switch http.statusCode {
            case 200..<300:
                return data
            case 401 where authenticated && attempt == 0:
                attempt += 1
                try await refreshSession()
                continue
            default:
                // Status code only — bodies are never logged or surfaced.
                throw APIError.http(http.statusCode)
            }
        }
    }

    private func request<B: Encodable, R: Decodable>(_ method: Method,
                                                     _ path: String,
                                                     body: B?,
                                                     authenticated: Bool) async throws -> R {
        let data = try await execute(method, path, body: body, authenticated: authenticated)
        return try JSONDecoder().decode(R.self, from: data)
    }

    private func requestVoid<B: Encodable>(_ method: Method,
                                           _ path: String,
                                           body: B?,
                                           authenticated: Bool) async throws {
        _ = try await execute(method, path, body: body, authenticated: authenticated)
    }
}

// MARK: - Prekey bundle DTO (GET /api/v1/users/:id/prekey)

public struct PreKeyBundleResponse: Decodable {
    public struct SignedPreKey: Decodable {
        public let id: Int
        public let publicKey: String
        public let signature: String
        enum CodingKeys: String, CodingKey {
            case id
            case publicKey = "public_key"
            case signature
        }
    }

    public struct OneTimePreKey: Decodable {
        public let id: Int
        public let publicKey: String
        enum CodingKeys: String, CodingKey {
            case id
            case publicKey = "public_key"
        }
    }

    /// The zero-knowledge server stores nothing device-identifying and does
    /// not issue registration IDs, so the field is absent from the bundle
    /// JSON. A fixed value satisfies libsignal's addressing in this
    /// one-device-per-account design.
    public let registrationID: Int
    public let identityKey: String
    public let signedPreKey: SignedPreKey
    /// Nil when the contact's one-time stock is exhausted; X3DH proceeds
    /// without it (slightly weaker forward secrecy for the first message).
    public let oneTimePreKey: OneTimePreKey?

    enum CodingKeys: String, CodingKey {
        case registrationID = "registration_id"
        case identityKey = "identity_key"
        case signedPreKey = "signed_prekey"
        case oneTimePreKey = "one_time_prekey"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        registrationID = try container.decodeIfPresent(Int.self, forKey: .registrationID) ?? 1
        identityKey = try container.decode(String.self, forKey: .identityKey)
        signedPreKey = try container.decode(SignedPreKey.self, forKey: .signedPreKey)
        oneTimePreKey = try container.decodeIfPresent(OneTimePreKey.self, forKey: .oneTimePreKey)
    }

    public init(registrationID: Int,
                identityKey: String,
                signedPreKey: SignedPreKey,
                oneTimePreKey: OneTimePreKey?) {
        self.registrationID = registrationID
        self.identityKey = identityKey
        self.signedPreKey = signedPreKey
        self.oneTimePreKey = oneTimePreKey
    }
}
