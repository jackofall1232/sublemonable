// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  CONNECTION_MODES,
  connectionModeConfig,
  DECOY_CADENCE_SECONDS,
} from "./connection.js";
import {
  DEFAULT_PRIVACY_VIEW,
  platformWarning,
  privacyViewActive,
  type PrivacyViewSettings,
} from "./privacy.js";

describe("connection modes", () => {
  it("Tor is the default transport in every mode", () => {
    for (const mode of Object.values(CONNECTION_MODES)) {
      expect(mode.tor).toBe(true);
    }
  });

  it("escalate hops and decoy from standard → stealth → ghost", () => {
    expect(connectionModeConfig("standard").relayHops).toBe(1);
    expect(connectionModeConfig("stealth").relayHops).toBe(3);
    expect(connectionModeConfig("ghost").relayHops).toBe(3);
    expect(connectionModeConfig("standard").decoyTraffic).toBe(false);
    expect(connectionModeConfig("ghost").decoyTraffic).toBe(true);
    // Only Ghost makes every message a dead drop.
    expect(connectionModeConfig("ghost").deadDrop).toBe(true);
    expect(connectionModeConfig("stealth").deadDrop).toBe(false);
  });

  it("lit segments grow with mode intensity", () => {
    expect(connectionModeConfig("standard").litSegments).toBeLessThan(
      connectionModeConfig("stealth").litSegments,
    );
    expect(connectionModeConfig("stealth").litSegments).toBeLessThan(
      connectionModeConfig("ghost").litSegments,
    );
  });

  it("ghost runs the fastest decoy cadence", () => {
    expect(DECOY_CADENCE_SECONDS.off).toBeNull();
    expect(DECOY_CADENCE_SECONDS.high![1]).toBeLessThan(DECOY_CADENCE_SECONDS.medium![1]);
  });
});

describe("platform warning", () => {
  it("warns a native user when their contact is on browser", () => {
    const w = platformWarning("ios", "browser");
    expect(w.show).toBe(true);
    expect(w.copy).toMatch(/screenshot protection unavailable/);
  });

  it("warns a browser user about their own limitation, honestly", () => {
    const w = platformWarning("browser", "android");
    expect(w.show).toBe(true);
    expect(w.copy).toMatch(/can be screenshotted/);
  });

  it("stays silent when both are on native apps", () => {
    expect(platformWarning("ios", "android").show).toBe(false);
  });
});

describe("privacy view", () => {
  it("per-conversation overrides the global toggle", () => {
    const settings: PrivacyViewSettings = {
      ...DEFAULT_PRIVACY_VIEW,
      globalEnabled: false,
      perConversation: { peerA: true },
    };
    expect(privacyViewActive(settings, "peerA")).toBe(true);
    expect(privacyViewActive(settings, "peerB")).toBe(false);
  });

  it("falls back to the global toggle without an override", () => {
    const settings: PrivacyViewSettings = { ...DEFAULT_PRIVACY_VIEW, globalEnabled: true };
    expect(privacyViewActive(settings, "anyone")).toBe(true);
  });
});
