// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.data.ConnectionMode
import com.sublemonable.app.data.CoverTrafficIntensity
import com.sublemonable.app.data.Platform
import com.sublemonable.app.data.PlatformWarning
import com.sublemonable.app.data.PrivacyViewSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionModeTest {

    @Test
    fun `tor is the default transport in every mode`() {
        for (mode in ConnectionMode.values()) assertTrue(mode.tor)
    }

    @Test
    fun `hops and decoy escalate from standard to ghost`() {
        assertEquals(1, ConnectionMode.STANDARD.relayHops)
        assertEquals(3, ConnectionMode.STEALTH.relayHops)
        assertEquals(3, ConnectionMode.GHOST.relayHops)
        assertFalse(ConnectionMode.STANDARD.decoyTraffic)
        assertTrue(ConnectionMode.GHOST.decoyTraffic)
        // Only Ghost makes every message a dead drop.
        assertTrue(ConnectionMode.GHOST.deadDrop)
        assertFalse(ConnectionMode.STEALTH.deadDrop)
    }

    @Test
    fun `lit segments grow with intensity`() {
        assertTrue(ConnectionMode.STANDARD.litSegments < ConnectionMode.STEALTH.litSegments)
        assertTrue(ConnectionMode.STEALTH.litSegments < ConnectionMode.GHOST.litSegments)
    }

    @Test
    fun `decoy cadence is fastest for high intensity`() {
        assertNull(ConnectionMode.cadenceSeconds(CoverTrafficIntensity.OFF))
        val high = ConnectionMode.cadenceSeconds(CoverTrafficIntensity.HIGH)!!
        val medium = ConnectionMode.cadenceSeconds(CoverTrafficIntensity.MEDIUM)!!
        assertTrue(high.second < medium.second)
    }

    @Test
    fun `platform warning is honest about browser limits`() {
        assertTrue(PlatformWarning.forPlatforms(Platform.IOS, Platform.BROWSER).show)
        assertTrue(PlatformWarning.forPlatforms(Platform.BROWSER, Platform.ANDROID).show)
        assertFalse(PlatformWarning.forPlatforms(Platform.IOS, Platform.ANDROID).show)
    }

    @Test
    fun `per-conversation privacy overrides the global toggle`() {
        val settings = PrivacyViewSettings(globalEnabled = false, perConversation = mapOf("a" to true))
        assertTrue(settings.activeFor("a"))
        assertFalse(settings.activeFor("b"))
    }
}
