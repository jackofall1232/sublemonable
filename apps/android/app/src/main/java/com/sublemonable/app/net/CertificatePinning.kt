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

    /** Host the pin applies to. Self-hosters: set this to your domain. */
    const val API_HOST = "api.sublemonable.com"

    /**
     * ╔══════════════════════════════════════════════════════════════════╗
     * ║ SELF-HOSTERS: REPLACE THIS PIN.                                  ║
     * ║                                                                  ║
     * ║ This is a PLACEHOLDER (all zero bytes) and will reject every     ║
     * ║ real certificate — the app intentionally cannot connect until    ║
     * ║ you pin your own server's key. Compute the real value with:     ║
     * ║                                                                  ║
     * ║   openssl s_client -connect your.host:443 < /dev/null \         ║
     * ║     | openssl x509 -pubkey -noout \                             ║
     * ║     | openssl pkey -pubin -outform DER \                        ║
     * ║     | openssl dgst -sha256 -binary | base64                     ║
     * ║                                                                  ║
     * ║ Pin the leaf AND a backup (intermediate or future key) so a     ║
     * ║ routine certificate rotation cannot brick the app.              ║
     * ╚══════════════════════════════════════════════════════════════════╝
     */
    const val PRIMARY_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    /** Backup pin — replace alongside [PRIMARY_PIN]. */
    const val BACKUP_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

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
