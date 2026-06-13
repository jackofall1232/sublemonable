// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Privacy-view and platform-warning settings (shared shapes). These are UI-layer
 * concerns — they never touch the crypto or the message envelope. Privacy view is
 * a shoulder-surfing defense (content blurred until you interact); the platform
 * warning honestly tells users when a participant is on a browser, where
 * OS-level screenshot protection isn't available.
 */

import type { Platform } from "./connection.js";

/** How a blurred message is revealed under privacy view. */
export type RevealMode = "hold_to_reveal" | "tap_timed" | "tap_toggle";

/** Auto-re-blur durations (seconds) for the timed reveal mode. */
export const TAP_TIMED_DURATIONS_SECONDS = [5, 10, 30] as const;
export const TAP_TIMED_DEFAULT_SECONDS = 10;

export interface PrivacyViewSettings {
  /** Applies privacy view to every conversation. */
  globalEnabled: boolean;
  /** Per-conversation overrides, keyed by peer ID. */
  perConversation: Record<string, boolean>;
  revealMode: RevealMode;
  tapTimedSeconds: number;
}

export const DEFAULT_PRIVACY_VIEW: PrivacyViewSettings = {
  globalEnabled: false,
  perConversation: {},
  revealMode: "hold_to_reveal",
  tapTimedSeconds: TAP_TIMED_DEFAULT_SECONDS,
};

/** True if privacy view is active for a given conversation. */
export function privacyViewActive(settings: PrivacyViewSettings, peerId: string): boolean {
  return settings.perConversation[peerId] ?? settings.globalEnabled;
}

/** Warning copy for the platform badge. Browser clients can't block screenshots
 *  at the OS level; native-app contacts deserve to know. */
export const PLATFORM_WARNING_COPY = {
  contactOnBrowser: "🌐 Messaging via browser — screenshot protection unavailable",
  ownBrowser: "🌐 You're on browser — your messages can be screenshotted",
} as const;

/** Whether to warn at all, and which copy, given who is on what. */
export function platformWarning(
  ownPlatform: Platform,
  contactPlatform: Platform | null,
): { show: boolean; copy: string } {
  const contactOnBrowser = contactPlatform === "browser";
  const ownOnBrowser = ownPlatform === "browser";
  if (ownOnBrowser) return { show: true, copy: PLATFORM_WARNING_COPY.ownBrowser };
  if (contactOnBrowser) return { show: true, copy: PLATFORM_WARNING_COPY.contactOnBrowser };
  return { show: false, copy: "" };
}
