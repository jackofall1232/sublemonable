// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.net

import com.sublemonable.app.tor.TorIntegration
import okhttp3.CertificatePinner
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.TlsVersion
import java.util.concurrent.TimeUnit

/**
 * TLS hardening for every connection the app makes:
 *  - certificate pinning via OkHttp [CertificatePinner]
 *  - TLS 1.3 only (security.transport)
 *  - optional SOCKS routing through Orbot (Tor)
 */
object CertificatePinning {

    /** Host the pin applies to. Must match API_BASE_URL/WS_URL in SublemonableApp. */
    const val API_HOST = "relay.sublemonable.com"

    /**
     * ╔══════════════════════════════════════════════════════════════════╗
     * ║ Deployment: relay.sublemonable.com                              ║
     * ║                                                                  ║
     * ║ SPKI pins (SHA-256 of the leaf SubjectPublicKeyInfo). PRIMARY is ║
     * ║ the live Let's Encrypt leaf; Caddy reuses its private key across ║
     * ║ renewals (reuse_private_keys) so the pin stays stable. BACKUP is ║
     * ║ an offline-held spare key — swap the server to it and the app    ║
     * ║ keeps connecting without an update. Keep BOTH; drop the old one  ║
     * ║ only after shipping an update that rotated to a new pair.        ║
     * ║                                                                  ║
     * ║ Re-derive with:                                                  ║
     * ║   openssl s_client -connect relay.sublemonable.com:443 \        ║
     * ║     < /dev/null | openssl x509 -pubkey -noout \                 ║
     * ║     | openssl pkey -pubin -outform DER \                        ║
     * ║     | openssl dgst -sha256 -binary | base64                     ║
     * ║                                                                  ║
     * ║ These MUST match the iOS client's PinnedSessionDelegate.swift.  ║
     * ╚══════════════════════════════════════════════════════════════════╝
     */
    const val PRIMARY_PIN = "sha256/TZbasNP1niaVV0fEtpn2QbjY1QiIS8R7w4zhaU5Yw3U="

    /** Backup pin — offline-held spare key. Replace alongside [PRIMARY_PIN]. */
    const val BACKUP_PIN = "sha256/BoqfuAlHFGnQJiL9nv7n7lAnRMixTWhpCWCs8v1eepM="

    private val pinner: CertificatePinner = CertificatePinner.Builder()
        .add(API_HOST, PRIMARY_PIN)
        .add(API_HOST, BACKUP_PIN)
        .build()

    private val tls13Only: ConnectionSpec = ConnectionSpec.Builder(ConnectionSpec.RESTRICTED_TLS)
        .tlsVersions(TlsVersion.TLS_1_3)
        .build()

    /**
     * Builds the app's OkHttp client. When [torEnabled] is set, all traffic
     * is proxied through Orbot's local SOCKS port — certificate pinning
     * still applies on top of the Tor circuit.
     */
    fun buildClient(torEnabled: Boolean = false): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .certificatePinner(pinner)
            .connectionSpecs(listOf(tls13Only))
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS) // WebSocket: no read timeout
            .writeTimeout(20, TimeUnit.SECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
        if (torEnabled) {
            builder.proxy(TorIntegration.socksProxy())
        }
        return builder.build()
    }
}
