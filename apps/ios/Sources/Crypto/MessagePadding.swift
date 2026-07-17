// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Security

/// Length-hiding plaintext padding, byte-compatible with the web client's
/// scheme (packages/crypto/src/padding.ts) and Android's MessagePadding: a
/// 4-byte big-endian length prefix, the plaintext, then random fill up to a
/// multiple of `blockBytes`.
///
/// Every plaintext that enters the Double Ratchet — conversation text AND
/// control payloads like read receipts — is padded first, so ciphertext
/// length buckets to 256/512/… and the relay cannot fingerprint a receipt
/// (or a short reply) by its size.
///
/// Receive-side compatibility: `unpadOrNil` returns nil for input that is
/// not a valid padded block, and callers fall back to treating the bytes as
/// legacy unpadded text (pre-padding clients). The reverse aliasing —
/// legacy text that parses as valid padding — would need the text to begin
/// with a NUL byte, which UTF-8 conversation text never does.
public enum MessagePadding {

    public static let blockBytes = 256
    private static let lenPrefixBytes = 4

    /// Pads `plaintext` to the next `blockBytes` boundary (minimum one block).
    public static func pad(_ plaintext: Data) -> Data {
        let bodyLen = lenPrefixBytes + plaintext.count
        let totalLen = max(((bodyLen + blockBytes - 1) / blockBytes) * blockBytes, blockBytes)
        var out = Data(count: totalLen)
        let length = UInt32(plaintext.count)
        out[0] = UInt8((length >> 24) & 0xFF)
        out[1] = UInt8((length >> 16) & 0xFF)
        out[2] = UInt8((length >> 8) & 0xFF)
        out[3] = UInt8(length & 0xFF)
        out.replaceSubrange(lenPrefixBytes..<bodyLen, with: plaintext)
        if totalLen > bodyLen {
            var fill = [UInt8](repeating: 0, count: totalLen - bodyLen)
            // Cryptographic randomness so the padding region carries no
            // recoverable structure; zero fill is the (safe) fallback only if
            // SecRandom ever fails, which does not weaken length hiding.
            _ = SecRandomCopyBytes(kSecRandomDefault, fill.count, &fill)
            out.replaceSubrange(bodyLen..<totalLen, with: fill)
        }
        return out
    }

    /// Recovers the original plaintext, or nil when `padded` is not a valid
    /// padded block (legacy unpadded sender — caller uses the bytes as-is).
    public static func unpadOrNil(_ padded: Data) -> Data? {
        guard padded.count >= lenPrefixBytes else { return nil }
        let bytes = [UInt8](padded.prefix(lenPrefixBytes))
        let length = (Int(bytes[0]) << 24) | (Int(bytes[1]) << 16)
            | (Int(bytes[2]) << 8) | Int(bytes[3])
        guard length >= 0, length <= padded.count - lenPrefixBytes else { return nil }
        return padded.subdata(in: lenPrefixBytes..<(lenPrefixBytes + length))
    }
}
