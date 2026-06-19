// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import Security
import CryptoKit

/// Certificate pinning shared by the REST client (URLSession) and the
/// WebSocket client (Starscream). Pins are SHA-256 over the leaf
/// certificate's SubjectPublicKeyInfo (SPKI) — the same `sha256/<base64>`
/// format OkHttp uses on Android — checked AFTER the system has validated
/// the chain. SPKI pinning survives certificate renewals that keep the same
/// key pair; pinning narrows trust, it never widens it.
public enum CertificatePin {
    // =========================================================================
    // Deployment: relay.sublemonable.com
    //
    // SPKI pins (SHA-256 over the leaf certificate's SubjectPublicKeyInfo). The
    // primary is the live Let's Encrypt leaf; Caddy reuses its private key across
    // renewals (tls { reuse_private_keys }), so this value stays stable through
    // renewal. The backup is an offline-held spare key — point the server at it
    // and the app keeps trusting it without an app update. Keep BOTH pins; drop
    // the old one only after shipping an update that has rotated to a new pair.
    //
    // Re-derive a pin with:
    //   openssl s_client -connect relay.sublemonable.com:443 < /dev/null 2>/dev/null \
    //     | openssl x509 -pubkey -noout \
    //     | openssl pkey -pubin -outform DER \
    //     | openssl dgst -sha256 -binary | base64
    //
    // These MUST match the Android client's CertificatePinning.kt.
    // =========================================================================
    public static let pinnedSPKISHA256: Set<String> = [
        "sha256/TZbasNP1niaVV0fEtpn2QbjY1QiIS8R7w4zhaU5Yw3U=", // primary — live leaf key
        "sha256/BoqfuAlHFGnQJiL9nv7n7lAnRMixTWhpCWCs8v1eepM="  // backup — offline spare key
    ]

    /// Evaluates a server trust object: full system chain validation first,
    /// then leaf SPKI pin comparison.
    public static func evaluate(trust: SecTrust) -> Bool {
        // 1. Standard chain validation (expiry, hostname, CA path).
        var error: CFError?
        guard SecTrustEvaluateWithError(trust, &error) else { return false }

        // 2. Leaf SPKI pin.
        guard let leaf = leafCertificate(of: trust),
              let spki = subjectPublicKeyInfo(of: leaf) else { return false }
        let digest = Data(SHA256.hash(data: spki))
        let pin = "sha256/" + digest.base64EncodedString()
        return pinnedSPKISHA256.contains(pin)
    }

    private static func leafCertificate(of trust: SecTrust) -> SecCertificate? {
        if #available(iOS 15.0, *) {
            let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate]
            return chain?.first
        } else {
            return SecTrustGetCertificateAtIndex(trust, 0)
        }
    }

    /// Reconstructs the DER SubjectPublicKeyInfo from the certificate's key.
    /// Security.framework only exposes the raw key bytes
    /// (`SecKeyCopyExternalRepresentation`), so the ASN.1 SPKI header for the
    /// key's type/size is prepended — the standard approach (cf. TrustKit).
    private static func subjectPublicKeyInfo(of certificate: SecCertificate) -> Data? {
        guard let key = SecCertificateCopyKey(certificate),
              let attributes = SecKeyCopyAttributes(key) as? [String: Any],
              let keyType = attributes[kSecAttrKeyType as String] as? String,
              let keySize = attributes[kSecAttrKeySizeInBits as String] as? Int,
              let rawKey = SecKeyCopyExternalRepresentation(key, nil) as Data?
        else { return nil }

        guard let header = spkiHeader(keyType: keyType, keySize: keySize) else { return nil }
        return header + rawKey
    }

    private static func spkiHeader(keyType: String, keySize: Int) -> Data? {
        switch (keyType, keySize) {
        case (kSecAttrKeyTypeRSA as String, 2048):
            return Data([0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09,
                         0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
                         0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00])
        case (kSecAttrKeyTypeRSA as String, 4096):
            return Data([0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09,
                         0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
                         0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00])
        case (kSecAttrKeyTypeECSECPrimeRandom as String, 256):
            return Data([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
                         0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
                         0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
                         0x42, 0x00])
        case (kSecAttrKeyTypeECSECPrimeRandom as String, 384):
            return Data([0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86,
                         0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b,
                         0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00])
        default:
            // Unsupported key type/size — fail closed.
            return nil
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
