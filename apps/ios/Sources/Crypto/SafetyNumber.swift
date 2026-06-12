// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import CryptoKit

/// Safety Number computation and formatting, per the master spec's
/// contact_verification section: "SHA-512 fingerprint of both identity keys",
/// displayed as groups of 4 hex characters (always in JetBrains Mono).
///
/// Pure functions only — unit-testable with no crypto-library or UI
/// dependencies beyond CryptoKit.
public enum SafetyNumber {
    /// Number of hex characters displayed (15 groups of 4 = 60 chars,
    /// matching the 60-digit convention users know from Signal).
    public static let displayedHexLength = 60
    public static let groupSize = 4

    /// Computes the shared safety number for a pair of identity keys.
    ///
    /// The two public keys are ordered lexicographically before hashing so
    /// both parties derive the IDENTICAL number regardless of who computes it
    /// — that symmetry is what makes out-loud comparison possible.
    public static func compute(identityKeyA: Data, identityKeyB: Data) -> String {
        let (first, second) = ordered(identityKeyA, identityKeyB)
        var hasher = SHA512()
        hasher.update(data: Data("sublemonable-safety-number-v1".utf8))
        hasher.update(data: first)
        hasher.update(data: second)
        let digest = Data(hasher.finalize())
        let hex = hexString(digest)
        return format(String(hex.prefix(displayedHexLength)))
    }

    /// Local-only fingerprint of a single identity key (Settings → Account).
    public static func fingerprint(identityKey: Data) -> String {
        let digest = Data(SHA512.hash(data: identityKey))
        let hex = hexString(digest)
        return format(String(hex.prefix(displayedHexLength)))
    }

    /// Formats a bare hex string into uppercase groups of 4 separated by
    /// single spaces: "a1b2c3d4e5f6" → "A1B2 C3D4 E5F6".
    public static func format(_ hex: String) -> String {
        let cleaned = hex
            .replacingOccurrences(of: " ", with: "")
            .uppercased()
        var groups: [String] = []
        var current = ""
        for character in cleaned {
            current.append(character)
            if current.count == groupSize {
                groups.append(current)
                current = ""
            }
        }
        if !current.isEmpty { groups.append(current) }
        return groups.joined(separator: " ")
    }

    /// Strict equality check for QR-scanned safety numbers; whitespace and
    /// case differences are not meaningful.
    public static func matches(_ a: String, _ b: String) -> Bool {
        normalize(a) == normalize(b)
    }

    private static func normalize(_ value: String) -> String {
        value.replacingOccurrences(of: " ", with: "").uppercased()
    }

    private static func ordered(_ a: Data, _ b: Data) -> (Data, Data) {
        // Lexicographic byte comparison.
        for (byteA, byteB) in zip(a, b) where byteA != byteB {
            return byteA < byteB ? (a, b) : (b, a)
        }
        return a.count <= b.count ? (a, b) : (b, a)
    }

    private static func hexString(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
