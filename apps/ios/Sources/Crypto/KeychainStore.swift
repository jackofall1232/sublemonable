// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Security
import LocalAuthentication

/// Keychain + Secure Enclave storage for ALL key material.
///
/// Security invariants (never violate):
/// - Key material NEVER touches the filesystem in plaintext. Everything goes
///   through the data-protection keychain (`kSecUseDataProtectionKeychain`).
/// - Every key item uses kSecAttrAccessControl built from
///   kSecAttrAccessibleWhenUnlockedThisDeviceOnly + .biometryCurrentSet —
///   bound to the CURRENT biometric enrolment; re-enrolling Face ID/Touch ID
///   invalidates the items rather than letting a new face/finger read them.
/// - The Curve25519 identity key required by the Signal Protocol cannot live
///   inside the Secure Enclave (the SE only supports NIST P-256). Instead, a
///   non-extractable P-256 key IS generated inside the Secure Enclave and the
///   serialized identity key is wrapped with it via ECIES before being stored
///   in the keychain. Plaintext identity-key bytes exist only transiently in
///   memory while in use.
/// - One authenticated LAContext is reused per process so the user gets a
///   single biometric prompt per session, not one per keychain read.
public final class KeychainStore {
    public enum KeychainError: Error {
        case unexpectedStatus(OSStatus)
        case accessControlCreationFailed
        case secureEnclaveUnavailable
        case wrapFailed
        case unwrapFailed
        case itemNotFound
    }

    public static let shared = KeychainStore()

    private let service = "org.sublemonable.keys"
    private let secureEnclaveTag = Data("org.sublemonable.se.wrapping-key".utf8)

    /// Reused so biometric evaluation happens once per session. `touchIDAuthenticationAllowableReuseDuration`
    /// lets keychain reads piggyback on the unlock-gate evaluation.
    private let authContext: LAContext

    public init() {
        let context = LAContext()
        context.touchIDAuthenticationAllowableReuseDuration = 30
        self.authContext = context
    }

    // MARK: - Access control

    private func biometricAccessControl() throws -> SecAccessControl {
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.biometryCurrentSet],
            &error
        ) else {
            throw KeychainError.accessControlCreationFailed
        }
        return access
    }

    private func secureEnclaveAccessControl() throws -> SecAccessControl {
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &error
        ) else {
            throw KeychainError.accessControlCreationFailed
        }
        return access
    }

    // MARK: - Generic data items

    /// Stores raw bytes under biometric protection. `biometricProtected: false`
    /// is reserved for non-key material (auth tokens) that must be readable
    /// without a fresh biometric check; it still uses
    /// WhenUnlockedThisDeviceOnly and never syncs off the device.
    public func set(_ data: Data, forKey key: String, biometricProtected: Bool = true) throws {
        try? delete(key)
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecUseDataProtectionKeychain as String: true
        ]
        if biometricProtected {
            query[kSecAttrAccessControl as String] = try biometricAccessControl()
            query[kSecUseAuthenticationContext as String] = authContext
        } else {
            query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
    }

    public func data(forKey key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseDataProtectionKeychain as String: true,
            kSecUseAuthenticationContext as String: authContext
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            return item as? Data
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unexpectedStatus(status)
        }
    }

    public func delete(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecUseDataProtectionKeychain as String: true
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Lists item account names with a given prefix (used by the protocol
    /// store to enumerate sessions/prekeys). Attribute-only query — no key
    /// material is returned and no biometric prompt is triggered.
    public func keys(withPrefix prefix: String) throws -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecUseDataProtectionKeychain as String: true
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let items = result as? [[String: Any]] else {
            throw KeychainError.unexpectedStatus(status)
        }
        return items
            .compactMap { $0[kSecAttrAccount as String] as? String }
            .filter { $0.hasPrefix(prefix) }
    }

    /// Account deletion / panic wipe: removes every item under our service.
    public func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecUseDataProtectionKeychain as String: true
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
        try? deleteSecureEnclaveKey()
    }

    // MARK: - Secure Enclave wrapping key

    /// Whether this device has a Secure Enclave we can use.
    public static var secureEnclaveAvailable: Bool {
        // SE requires a device with biometrics or passcode and real hardware;
        // on simulator SecKeyCreateRandomKey with the SE token fails, which
        // callers handle by falling back to plain biometric keychain items.
        #if targetEnvironment(simulator)
        return false
        #else
        return true
        #endif
    }

    private func loadSecureEnclaveKey() throws -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: secureEnclaveTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
            kSecUseAuthenticationContext as String: authContext
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            // Force-cast through optional protocol dance is unnecessary;
            // a key query returning success yields a SecKey.
            return (item as! SecKey) // swiftlint:disable:this force_cast
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private func createSecureEnclaveKey() throws -> SecKey {
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: secureEnclaveTag,
                kSecAttrAccessControl as String: try secureEnclaveAccessControl(),
                kSecUseAuthenticationContext as String: authContext
            ]
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw KeychainError.secureEnclaveUnavailable
        }
        return key
    }

    private func obtainSecureEnclaveKey() throws -> SecKey {
        if let existing = try loadSecureEnclaveKey() { return existing }
        return try createSecureEnclaveKey()
    }

    private func deleteSecureEnclaveKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: secureEnclaveTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private static let wrapAlgorithm: SecKeyAlgorithm =
        .eciesEncryptionCofactorVariableIVX963SHA256AESGCM

    /// ECIES-wraps arbitrary key material under the Secure Enclave key.
    public func secureEnclaveWrap(_ plaintext: Data) throws -> Data {
        let privateKey = try obtainSecureEnclaveKey()
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw KeychainError.wrapFailed
        }
        var error: Unmanaged<CFError>?
        guard let ciphertext = SecKeyCreateEncryptedData(
            publicKey, Self.wrapAlgorithm, plaintext as CFData, &error
        ) else {
            throw KeychainError.wrapFailed
        }
        return ciphertext as Data
    }

    /// Unwraps inside the Secure Enclave; requires current-set biometry.
    public func secureEnclaveUnwrap(_ ciphertext: Data) throws -> Data {
        guard let privateKey = try loadSecureEnclaveKey() else {
            throw KeychainError.itemNotFound
        }
        var error: Unmanaged<CFError>?
        guard let plaintext = SecKeyCreateDecryptedData(
            privateKey, Self.wrapAlgorithm, ciphertext as CFData, &error
        ) else {
            throw KeychainError.unwrapFailed
        }
        return plaintext as Data
    }

    // MARK: - Convenience: SE-wrapped storage

    /// Stores key material wrapped by the Secure Enclave when available,
    /// falling back to a biometric-protected keychain item otherwise
    /// (simulator / SE-less hardware).
    public func setWrapped(_ data: Data, forKey key: String) throws {
        if Self.secureEnclaveAvailable, let wrapped = try? secureEnclaveWrap(data) {
            try set(wrapped, forKey: "se." + key)
        } else {
            try set(data, forKey: key)
        }
    }

    public func wrappedData(forKey key: String) throws -> Data? {
        if let wrapped = try data(forKey: "se." + key) {
            return try secureEnclaveUnwrap(wrapped)
        }
        return try data(forKey: key)
    }

    public func deleteWrapped(_ key: String) throws {
        try delete("se." + key)
        try delete(key)
    }
}
