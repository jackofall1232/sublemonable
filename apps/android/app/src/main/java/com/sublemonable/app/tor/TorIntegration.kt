// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.tor

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import java.net.InetSocketAddress
import java.net.Proxy

/**
 * Optional Tor routing via Orbot (security.transport.tor — opt-in, never on
 * by default). When the user flips the Network > Tor toggle in settings, the
 * OkHttp client is rebuilt with Orbot's local SOCKS proxy. Certificate
 * pinning continues to apply on top of the Tor circuit.
 */
object TorIntegration {

    const val ORBOT_PACKAGE = "org.torproject.android"

    /** Orbot's broadcast action asking it to start Tor. */
    private const val ACTION_START = "org.torproject.android.intent.action.START"
    private const val EXTRA_PACKAGE_NAME = "org.torproject.android.intent.extra.PACKAGE_NAME"

    /** Orbot's default local SOCKS5 endpoint. */
    private const val SOCKS_HOST = "127.0.0.1"
    private const val SOCKS_PORT = 9050

    fun isOrbotInstalled(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(ORBOT_PACKAGE, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    /**
     * Asks Orbot to start Tor (it shows its own foreground notification).
     * No-op when Orbot is not installed — call [isOrbotInstalled] first to
     * route the user to an install prompt instead.
     */
    fun requestOrbotStart(context: Context) {
        if (!isOrbotInstalled(context)) return
        val intent = Intent(ACTION_START).apply {
            setPackage(ORBOT_PACKAGE)
            putExtra(EXTRA_PACKAGE_NAME, context.packageName)
        }
        context.sendBroadcast(intent)
    }

    /** F-Droid listing for Orbot — the fallback when no Play Store is present. */
    const val ORBOT_FDROID_URL = "https://f-droid.org/packages/$ORBOT_PACKAGE/"

    /** Opens the Play Store page for Orbot so the user can install it. */
    fun orbotInstallIntent(): Intent = Intent(
        Intent.ACTION_VIEW,
        android.net.Uri.parse("market://details?id=$ORBOT_PACKAGE"),
    )

    /** Opens the F-Droid listing for Orbot (second install option). */
    fun orbotFDroidIntent(): Intent = Intent(
        Intent.ACTION_VIEW,
        android.net.Uri.parse(ORBOT_FDROID_URL),
    )

    /** SOCKS proxy pointed at Orbot for OkHttp. */
    fun socksProxy(): Proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress(SOCKS_HOST, SOCKS_PORT))
}
