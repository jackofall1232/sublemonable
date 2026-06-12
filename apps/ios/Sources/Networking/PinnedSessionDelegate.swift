// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Security
import CryptoKit

/// Certificate pinning shared by the REST client (URLSession) and the
/// WebSocket client (Starscream). The server's leaf certificate must hash
/// (SHA-256 over the DER encoding) to one of the pinned values AFTER the
/// system has validated the chain — pinning narrows trust, it never widens it.
public enum CertificatePin {
    // =========================================================================
    // SELF-HOSTERS: REPLACE THIS PIN.
    //
    // This is a PLACEHOLDER value and will reject every real server. Compute
    // the pin for your deployment's certificate with:
    //
    //   openssl s_client -connect your.server:443 < /dev/null 2>/dev/null \
    //     | openssl x509 -outform DER | openssl dgst -sha256 -hex
    //
    // Add your previous/backup certificate's hash as a second entry before
    // rotating certificates, ship an update, then remove the old pin.
    // =========================================================================
    public static let pinnedSHA256Hashes: Set<String> = [
        "0000000000000000000000000000000000000000000000000000000000000000" // PLACEHOLDER — replace before deploying
    ]

    /// Evaluates a server trust object: full system chain validation first,
    /// then leaf-certificate SHA-256 pin comparison.
    public static func evaluate(trust: SecTrust) -> Bool {
        // 1. Standard chain validation (expiry, hostname, CA path).
        var error: CFError?
        guard SecTrustEvaluateWithError(trust, &error) else { return false }

        // 2. Leaf certificate pin.
        guard let leaf = leafCertificate(of: trust) else { return false }
        let der = SecCertificateCopyData(leaf) as Data
        let hash = SHA256.hash(data: der)
            .map { String(format: "%02x", $0) }
            .joined()
        return pinnedSHA256Hashes.contains(hash)
    }

    private static func leafCertificate(of trust: SecTrust) -> SecCertificate? {
        if #available(iOS 15.0, *) {
            let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate]
            return chain?.first
        } else {
            return SecTrustGetCertificateAtIndex(trust, 0)
        }
    }
}

/// URLSessionDelegate enforcing the certificate pin on every TLS handshake.
/// Used together with `URLSessionConfiguration.tlsMinimumSupportedProtocolVersion
/// = .TLSv13` (set in APIClient) so connections are TLS 1.3 minimum AND pinned.
public final class PinnedSessionDelegate: NSObject, URLSessionDelegate {
    public func urlSession(_ session: URLSession,
                           didReceive challenge: URLAuthenticationChallenge,
                           completionHandler: @escaping (URLSession.AuthChallengeDisposition,
                                                         URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        if CertificatePin.evaluate(trust: trust) {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            // Pin mismatch — possible MITM. Hard-fail; never fall back.
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
