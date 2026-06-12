// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import LibSignalClient

// =============================================================================
// LibSignalClient API mapping (pinned to the 0.56.x line in project.yml).
// If you bump the package version, re-verify these symbols:
//
//   IdentityKeyPair.generate()                       — identity generation
//   PrivateKey.generate() / .publicKey / .serialize  — Curve25519 keys
//   PrivateKey.generateSignature(message:)           — XEdDSA; verifiable as a
//                                                      standard Ed25519
//                                                      signature (login challenge)
//   PreKeyRecord(id:privateKey:) / (bytes:)          — one-time prekeys
//   SignedPreKeyRecord(id:timestamp:privateKey:signature:)
//   PreKeyBundle(registrationId:deviceId:prekeyId:prekey:signedPrekeyId:
//                signedPrekey:signedPrekeySignature:identity:)
//   processPreKeyBundle(_:for:sessionStore:identityStore:context:)  — X3DH
//   signalEncrypt(message:for:sessionStore:identityStore:context:)  — Double Ratchet
//   signalDecrypt(message:from:sessionStore:identityStore:context:)
//   signalDecryptPreKey(message:from:sessionStore:identityStore:preKeyStore:
//                       signedPreKeyStore:kyberPreKeyStore:context:)
//   SignalMessage(bytes:) / PreKeySignalMessage(bytes:)
//   ProtocolAddress(name:deviceId:), NullContext(), Direction
//
// Store protocols implemented below: IdentityKeyStore, PreKeyStore,
// SignedPreKeyStore, SessionStore, KyberPreKeyStore. All persisted records go
// through KeychainStore (biometric-protected, ThisDeviceOnly); the identity
// private key is additionally wrapped by a Secure Enclave key.
// =============================================================================

public enum SignalManagerError: Error {
    case notRegistered
    case noSession
    case recordNotFound
    case invalidEnvelope
    case untrustedIdentity
    case bundleUnavailable
}

/// Protocol-state store backed by KeychainStore. Never returns key material
/// to disk; serialized records live only inside the data-protection keychain.
public final class SublemonableProtocolStore: IdentityKeyStore, PreKeyStore,
                                              SignedPreKeyStore, SessionStore,
                                              KyberPreKeyStore {
    private let keychain: KeychainStore

    private enum Key {
        static let identityPrivate = "identity.private"
        static let registrationID = "identity.registration-id"
        static func preKey(_ id: UInt32) -> String { "prekey.\(id)" }
        static func signedPreKey(_ id: UInt32) -> String { "signed-prekey.\(id)" }
        static func kyberPreKey(_ id: UInt32) -> String { "kyber-prekey.\(id)" }
        static func session(_ address: ProtocolAddress) -> String {
            "session.\(address.name).\(address.deviceId)"
        }
        static func identity(_ address: ProtocolAddress) -> String {
            "remote-identity.\(address.name).\(address.deviceId)"
        }
    }

    public init(keychain: KeychainStore = .shared) {
        self.keychain = keychain
    }

    // MARK: Local identity bootstrap

    public var hasIdentity: Bool {
        (try? keychain.wrappedData(forKey: Key.identityPrivate)) != nil
    }

    public func createIdentity() throws -> IdentityKeyPair {
        let pair = IdentityKeyPair.generate()
        // The Curve25519 private key cannot live inside the Secure Enclave
        // (P-256 only), so it is ECIES-wrapped UNDER the Secure Enclave key
        // before storage. See KeychainStore for the full rationale.
        try keychain.setWrapped(Data(pair.privateKey.serialize()),
                                forKey: Key.identityPrivate)
        var registrationID = UInt32.random(in: 1..<16380)
        try keychain.set(withUnsafeBytes(of: &registrationID) { Data($0) },
                         forKey: Key.registrationID,
                         biometricProtected: false)
        return pair
    }

    private func loadIdentity() throws -> IdentityKeyPair {
        guard let bytes = try keychain.wrappedData(forKey: Key.identityPrivate) else {
            throw SignalManagerError.notRegistered
        }
        let privateKey = try PrivateKey(Array(bytes))
        return IdentityKeyPair(publicKey: privateKey.publicKey, privateKey: privateKey)
    }

    public func wipe() throws {
        try keychain.deleteAll()
    }

    // MARK: IdentityKeyStore

    public func identityKeyPair(context: StoreContext) throws -> IdentityKeyPair {
        try loadIdentity()
    }

    public func localRegistrationId(context: StoreContext) throws -> UInt32 {
        guard let data = try keychain.data(forKey: Key.registrationID),
              data.count == MemoryLayout<UInt32>.size else {
            throw SignalManagerError.notRegistered
        }
        return data.withUnsafeBytes { $0.load(as: UInt32.self) }
    }

    @discardableResult
    public func saveIdentity(_ identity: IdentityKey,
                             for address: ProtocolAddress,
                             context: StoreContext) throws -> Bool {
        let key = Key.identity(address)
        let existing = try keychain.data(forKey: key)
        let serialized = Data(identity.serialize())
        try keychain.set(serialized, forKey: key)
        // True when an existing, different identity was replaced — callers
        // surface the "Key changed — verify identity" warning off this.
        return existing != nil && existing != serialized
    }

    public func isTrustedIdentity(_ identity: IdentityKey,
                                  for address: ProtocolAddress,
                                  direction: Direction,
                                  context: StoreContext) throws -> Bool {
        guard let stored = try keychain.data(forKey: Key.identity(address)) else {
            // Trust-on-first-use; verification happens via safety numbers.
            return true
        }
        return stored == Data(identity.serialize())
    }

    public func identity(for address: ProtocolAddress,
                         context: StoreContext) throws -> IdentityKey? {
        guard let data = try keychain.data(forKey: Key.identity(address)) else { return nil }
        return try IdentityKey(bytes: Array(data))
    }

    // MARK: PreKeyStore

    public func loadPreKey(id: UInt32, context: StoreContext) throws -> PreKeyRecord {
        guard let data = try keychain.data(forKey: Key.preKey(id)) else {
            throw SignalManagerError.recordNotFound
        }
        return try PreKeyRecord(bytes: Array(data))
    }

    public func storePreKey(_ record: PreKeyRecord, id: UInt32, context: StoreContext) throws {
        try keychain.set(Data(record.serialize()), forKey: Key.preKey(id))
    }

    /// One-time prekeys are single-use BY DESIGN — libsignal calls this after
    /// consuming one during X3DH and the private half is gone forever.
    public func removePreKey(id: UInt32, context: StoreContext) throws {
        try keychain.delete(Key.preKey(id))
    }

    public var storedPreKeyCount: Int {
        (try? keychain.keys(withPrefix: "prekey.").count) ?? 0
    }

    // MARK: SignedPreKeyStore

    public func loadSignedPreKey(id: UInt32, context: StoreContext) throws -> SignedPreKeyRecord {
        guard let data = try keychain.data(forKey: Key.signedPreKey(id)) else {
            throw SignalManagerError.recordNotFound
        }
        return try SignedPreKeyRecord(bytes: Array(data))
    }

    public func storeSignedPreKey(_ record: SignedPreKeyRecord,
                                  id: UInt32,
                                  context: StoreContext) throws {
        try keychain.set(Data(record.serialize()), forKey: Key.signedPreKey(id))
    }

    // MARK: KyberPreKeyStore
    // Required by signalDecryptPreKey since libsignal added post-quantum
    // (Kyber) prekeys. Sublemonable v1 bundles are Curve25519-only, so these
    // records only appear if a future server adds Kyber bundles.

    public func loadKyberPreKey(id: UInt32, context: StoreContext) throws -> KyberPreKeyRecord {
        guard let data = try keychain.data(forKey: Key.kyberPreKey(id)) else {
            throw SignalManagerError.recordNotFound
        }
        return try KyberPreKeyRecord(bytes: Array(data))
    }

    public func storeKyberPreKey(_ record: KyberPreKeyRecord,
                                 id: UInt32,
                                 context: StoreContext) throws {
        try keychain.set(Data(record.serialize()), forKey: Key.kyberPreKey(id))
    }

    public func markKyberPreKeyUsed(id: UInt32, context: StoreContext) throws {
        // Last-resort Kyber prekeys are reusable; one-shot ones are removed.
        try keychain.delete(Key.kyberPreKey(id))
    }

    // MARK: SessionStore

    public func loadSession(for address: ProtocolAddress,
                            context: StoreContext) throws -> SessionRecord? {
        guard let data = try keychain.data(forKey: Key.session(address)) else { return nil }
        return try SessionRecord(bytes: Array(data))
    }

    public func loadExistingSessions(for addresses: [ProtocolAddress],
                                     context: StoreContext) throws -> [SessionRecord] {
        try addresses.compactMap { try loadSession(for: $0, context: context) }
    }

    public func storeSession(_ record: SessionRecord,
                             for address: ProtocolAddress,
                             context: StoreContext) throws {
        try keychain.set(Data(record.serialize()), forKey: Key.session(address))
    }

    public func hasSession(for address: ProtocolAddress) -> Bool {
        (try? keychain.data(forKey: Key.session(address))) != nil
    }
}

/// High-level Signal Protocol facade: identity generation, prekey
/// generation/rotation, X3DH session establishment from fetched bundles, and
/// per-message Double Ratchet encrypt/decrypt producing/consuming the shared
/// MessageEnvelope wire format.
public final class SignalManager {
    /// All registered devices are device 1 in v1 (no multi-device yet).
    public static let deviceID: UInt32 = 1
    /// Signed prekey rotation interval: 7 days, per the master spec.
    public static let signedPreKeyRotationInterval: TimeInterval = 7 * 24 * 60 * 60
    /// One-time prekey batch size, per the master spec.
    public static let oneTimePreKeyBatchSize = 100

    public let store: SublemonableProtocolStore
    private let keychain: KeychainStore
    private let queue = DispatchQueue(label: "org.sublemonable.signal")

    /// Wired up at app start to APIClient.fetchPreKeyBundle — lets encrypt()
    /// run X3DH lazily on first message to a new contact.
    public var bundleFetcher: ((UUID) async throws -> PreKeyBundleResponse)?

    /// Envelope metadata counters (message_number / previous_chain_length).
    /// The authoritative ratchet counters live inside the ciphertext itself;
    /// libsignal does not publicly expose previousCounter, so the envelope
    /// metadata mirrors it with local bookkeeping.
    private var sendCounters: [UUID: (messageNumber: Int, previousChainLength: Int)] = [:]

    private enum MetaKey {
        static let accountID = "account.id"
        static let signedPreKeyRotatedAt = "signed-prekey.rotated-at"
        static let signedPreKeyCurrentID = "signed-prekey.current-id"
        static let nextPreKeyID = "prekey.next-id"
    }

    public init(keychain: KeychainStore = .shared) {
        self.keychain = keychain
        self.store = SublemonableProtocolStore(keychain: keychain)
    }

    // MARK: - Account identity

    public var accountID: UUID? {
        guard let data = try? keychain.data(forKey: MetaKey.accountID),
              let string = String(data: data, encoding: .utf8) else { return nil }
        return UUID(uuidString: string)
    }

    public func setAccountID(_ id: UUID) throws {
        try keychain.set(Data(id.uuidString.lowercased().utf8),
                         forKey: MetaKey.accountID,
                         biometricProtected: false)
    }

    public var isRegistered: Bool {
        store.hasIdentity && accountID != nil
    }

    /// Serialized public identity key (0x05-prefixed Curve25519), for
    /// registration upload, QR exchange, and safety numbers.
    public func localIdentityPublicKey() throws -> Data {
        try queue.sync {
            let pair = try store.identityKeyPair(context: NullContext())
            return Data(pair.identityKey.serialize())
        }
    }

    /// Generates the identity + first signed prekey + one-time prekey batch.
    /// Returns everything the registration endpoint needs (PUBLIC halves only
    /// — private keys never leave the keychain).
    public func bootstrapIdentity() throws -> RegistrationKeys {
        try queue.sync {
            let context = NullContext()
            let identity: IdentityKeyPair = store.hasIdentity
                ? try store.identityKeyPair(context: context)
                : try store.createIdentity()

            let signed = try generateSignedPreKeyLocked(identity: identity)
            let oneTime = try generateOneTimePreKeysLocked(count: Self.oneTimePreKeyBatchSize)
            return RegistrationKeys(
                identityKey: Data(identity.identityKey.serialize()).base64EncodedString(),
                registrationID: Int(try store.localRegistrationId(context: context)),
                signedPreKey: signed,
                oneTimePreKeys: oneTime
            )
        }
    }

    // MARK: - Prekey generation / rotation

    /// Generates a fresh batch of one-time prekeys (public halves returned
    /// for upload; the server stores public keys only).
    public func generateOneTimePreKeys(count: Int = SignalManager.oneTimePreKeyBatchSize)
        throws -> [OneTimePreKeyUpload] {
        try queue.sync { try generateOneTimePreKeysLocked(count: count) }
    }

    private func generateOneTimePreKeysLocked(count: Int) throws -> [OneTimePreKeyUpload] {
        let context = NullContext()
        var nextID = loadCounter(MetaKey.nextPreKeyID, default: 1)
        var uploads: [OneTimePreKeyUpload] = []
        for _ in 0..<count {
            let privateKey = PrivateKey.generate()
            let record = try PreKeyRecord(id: UInt32(nextID), privateKey: privateKey)
            try store.storePreKey(record, id: UInt32(nextID), context: context)
            uploads.append(OneTimePreKeyUpload(
                id: nextID,
                publicKey: Data(privateKey.publicKey.serialize()).base64EncodedString()
            ))
            nextID += 1
        }
        storeCounter(MetaKey.nextPreKeyID, value: nextID)
        return uploads
    }

    /// Rotates the signed prekey when older than 7 days. Returns the new
    /// public half for upload, or nil when rotation is not yet due.
    public func rotateSignedPreKeyIfNeeded() throws -> SignedPreKeyUpload? {
        try queue.sync {
            if let data = try? keychain.data(forKey: MetaKey.signedPreKeyRotatedAt),
               let interval = String(data: data, encoding: .utf8).flatMap(TimeInterval.init) {
                let rotatedAt = Date(timeIntervalSince1970: interval)
                guard Date().timeIntervalSince(rotatedAt) >= Self.signedPreKeyRotationInterval else {
                    return nil
                }
            }
            let identity = try store.identityKeyPair(context: NullContext())
            return try generateSignedPreKeyLocked(identity: identity)
        }
    }

    private func generateSignedPreKeyLocked(identity: IdentityKeyPair) throws -> SignedPreKeyUpload {
        let context = NullContext()
        let id = loadCounter(MetaKey.signedPreKeyCurrentID, default: 0) + 1
        let privateKey = PrivateKey.generate()
        // The signed prekey's public key is signed by the identity key —
        // recipients verify provenance before running X3DH against it.
        let signature = identity.privateKey.generateSignature(
            message: privateKey.publicKey.serialize()
        )
        let record = try SignedPreKeyRecord(
            id: UInt32(id),
            timestamp: UInt64(Date().timeIntervalSince1970 * 1000),
            privateKey: privateKey,
            signature: signature
        )
        try store.storeSignedPreKey(record, id: UInt32(id), context: context)
        storeCounter(MetaKey.signedPreKeyCurrentID, value: id)
        try keychain.set(Data(String(Date().timeIntervalSince1970).utf8),
                         forKey: MetaKey.signedPreKeyRotatedAt,
                         biometricProtected: false)
        return SignedPreKeyUpload(
            id: id,
            publicKey: Data(privateKey.publicKey.serialize()).base64EncodedString(),
            signature: Data(signature).base64EncodedString()
        )
    }

    // MARK: - X3DH session establishment

    /// Builds a session from a prekey bundle fetched via
    /// GET /api/v1/users/:id/prekey. The consumed one-time prekey is
    /// single-use; the server deletes its copy on fetch.
    public func processBundle(_ response: PreKeyBundleResponse, for contactID: UUID) throws {
        try queue.sync {
            let context = NullContext()
            let address = try ProtocolAddress(name: contactID.uuidString.lowercased(),
                                              deviceId: Self.deviceID)
            guard
                let identityBytes = Data(base64Encoded: response.identityKey),
                let signedKeyBytes = Data(base64Encoded: response.signedPreKey.publicKey),
                let signatureBytes = Data(base64Encoded: response.signedPreKey.signature)
            else { throw SignalManagerError.invalidEnvelope }

            var oneTimeID: UInt32?
            var oneTimeKey: PublicKey?
            if let oneTime = response.oneTimePreKey,
               let bytes = Data(base64Encoded: oneTime.publicKey) {
                oneTimeID = UInt32(oneTime.id)
                oneTimeKey = try PublicKey(Array(bytes))
            }

            let bundle = try PreKeyBundle(
                registrationId: UInt32(response.registrationID),
                deviceId: Self.deviceID,
                prekeyId: oneTimeID,
                prekey: oneTimeKey,
                signedPrekeyId: UInt32(response.signedPreKey.id),
                signedPrekey: try PublicKey(Array(signedKeyBytes)),
                signedPrekeySignature: Array(signatureBytes),
                identity: try IdentityKey(bytes: Array(identityBytes))
            )
            // X3DH: verifies the signed-prekey signature and installs the
            // initiating session into our SessionStore.
            try processPreKeyBundle(
                bundle,
                for: address,
                sessionStore: store,
                identityStore: store,
                context: context
            )
        }
    }

    public func hasSession(with contactID: UUID) -> Bool {
        guard let address = try? ProtocolAddress(name: contactID.uuidString.lowercased(),
                                                 deviceId: Self.deviceID) else { return false }
        return store.hasSession(for: address)
    }

    // MARK: - Encrypt / decrypt

    /// Encrypts plaintext for a contact, establishing the X3DH session first
    /// when none exists (fetching their prekey bundle via bundleFetcher).
    public func encrypt(plaintext: Data,
                        for contact: Contact,
                        messageID: UUID,
                        ttlSeconds: Int?,
                        burnOnRead: Bool,
                        mediaType: MessageEnvelope.MediaType = .text) async throws -> MessageEnvelope {
        guard let senderID = accountID else { throw SignalManagerError.notRegistered }

        if !hasSession(with: contact.id) {
            guard let bundleFetcher else { throw SignalManagerError.bundleUnavailable }
            let bundle = try await bundleFetcher(contact.id)
            try processBundle(bundle, for: contact.id)
        }

        return try queue.sync {
            let context = NullContext()
            let address = try ProtocolAddress(name: contact.id.uuidString.lowercased(),
                                              deviceId: Self.deviceID)
            let ciphertext = try signalEncrypt(
                message: Array(plaintext),
                for: address,
                sessionStore: store,
                identityStore: store,
                context: context
            )

            var counters = sendCounters[contact.id] ?? (messageNumber: -1, previousChainLength: 0)
            counters.messageNumber += 1
            sendCounters[contact.id] = counters

            // X3DH-initiating messages carry the ephemeral base key and the
            // consumed prekey id in the envelope (null after session setup).
            var ephemeralKey: String?
            var prekeyID: Int?
            if ciphertext.messageType == .preKey {
                let preKeyMessage = try PreKeySignalMessage(bytes: ciphertext.serialize())
                ephemeralKey = Data(preKeyMessage.baseKey.serialize()).base64EncodedString()
                prekeyID = preKeyMessage.preKeyId.map(Int.init)
            }

            return MessageEnvelope(
                id: messageID.uuidString.lowercased(),
                senderID: senderID.uuidString.lowercased(),
                recipientID: contact.id.uuidString.lowercased(),
                ciphertext: Data(ciphertext.serialize()).base64EncodedString(),
                ephemeralKey: ephemeralKey,
                prekeyID: prekeyID,
                messageNumber: counters.messageNumber,
                previousChainLength: counters.previousChainLength,
                ttlSeconds: ttlSeconds,
                burnOnRead: burnOnRead,
                mediaType: mediaType
            )
        }
    }

    /// Decrypts an inbound envelope. Message keys are derived per message and
    /// discarded after use by the Double Ratchet inside libsignal.
    public func decrypt(envelope: MessageEnvelope) throws -> Data {
        try queue.sync {
            let context = NullContext()
            guard let ciphertext = Data(base64Encoded: envelope.ciphertext) else {
                throw SignalManagerError.invalidEnvelope
            }
            let address = try ProtocolAddress(name: envelope.senderID.lowercased(),
                                              deviceId: Self.deviceID)

            // ephemeral_key set ⇒ X3DH-initiating prekey message.
            if envelope.ephemeralKey != nil {
                let message = try PreKeySignalMessage(bytes: Array(ciphertext))
                let plaintext = try signalDecryptPreKey(
                    message: message,
                    from: address,
                    sessionStore: store,
                    identityStore: store,
                    preKeyStore: store,
                    signedPreKeyStore: store,
                    kyberPreKeyStore: store,
                    context: context
                )
                return Data(plaintext)
            } else {
                let message = try SignalMessage(bytes: Array(ciphertext))
                let plaintext = try signalDecrypt(
                    message: message,
                    from: address,
                    sessionStore: store,
                    identityStore: store,
                    context: context
                )
                return Data(plaintext)
            }
        }
    }

    // MARK: - Login challenge

    /// Signs the server login challenge with the identity key. The challenge
    /// format is fixed by the server spec:
    ///     "sublemonable-login:<account_id>:<unix_ts>"
    /// The XEdDSA signature produced by the Curve25519 identity key verifies
    /// as a standard Ed25519 signature server-side.
    public func loginSignature(accountID: UUID, unixTimestamp: Int) throws -> Data {
        try queue.sync {
            let identity = try store.identityKeyPair(context: NullContext())
            let challenge = "sublemonable-login:\(accountID.uuidString.lowercased()):\(unixTimestamp)"
            return Data(identity.privateKey.generateSignature(message: Array(challenge.utf8)))
        }
    }

    // MARK: - Verification

    public func safetyNumber(with contact: Contact) throws -> String {
        let localKey = try localIdentityPublicKey()
        return SafetyNumber.compute(identityKeyA: localKey, identityKeyB: contact.identityKey)
    }

    public func localFingerprint() throws -> String {
        SafetyNumber.fingerprint(identityKey: try localIdentityPublicKey())
    }

    /// QR contact-exchange payload for this account.
    public func contactExchangePayload() throws -> String {
        guard let accountID else { throw SignalManagerError.notRegistered }
        let payload = ContactExchangePayload(
            version: "1",
            accountID: accountID.uuidString.lowercased(),
            identityKey: try localIdentityPublicKey().base64EncodedString()
        )
        let data = try JSONEncoder().encode(payload)
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: - Destruction

    /// Account deletion: destroys all local key material irreversibly.
    public func wipe() throws {
        try queue.sync {
            sendCounters.removeAll()
            try store.wipe()
        }
    }

    // MARK: - Counter persistence (non-secret bookkeeping)

    private func loadCounter(_ key: String, default defaultValue: Int) -> Int {
        guard let data = try? keychain.data(forKey: key),
              let value = String(data: data, encoding: .utf8).flatMap(Int.init) else {
            return defaultValue
        }
        return value
    }

    private func storeCounter(_ key: String, value: Int) {
        try? keychain.set(Data(String(value).utf8), forKey: key, biometricProtected: false)
    }
}

// MARK: - Upload payload shapes (public keys only)

public struct OneTimePreKeyUpload: Codable {
    public let id: Int
    public let publicKey: String

    enum CodingKeys: String, CodingKey {
        case id
        case publicKey = "public_key"
    }
}

public struct SignedPreKeyUpload: Codable {
    public let id: Int
    public let publicKey: String
    public let signature: String

    enum CodingKeys: String, CodingKey {
        case id
        case publicKey = "public_key"
        case signature
    }
}

public struct RegistrationKeys {
    public let identityKey: String
    public let registrationID: Int
    public let signedPreKey: SignedPreKeyUpload
    public let oneTimePreKeys: [OneTimePreKeyUpload]
}
