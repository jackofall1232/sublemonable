// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Build-time configuration injected by Vite (see vite.config.ts).

import type { TransportState } from "@sublemonable/protocol";

/**
 * The relay onion address. NEVER published in docs or committed to source — it
 * is baked into the app at build time via VITE_RELAY_ONION_ADDRESS so the relay
 * hidden service is not discoverable from the repository. Empty when the build
 * did not set it (e.g. clearnet-only dev builds).
 */
export const RELAY_ONION_ADDRESS: string =
  // @ts-expect-error injected by vite define
  typeof __RELAY_ONION_ADDRESS__ !== "undefined" ? __RELAY_ONION_ADDRESS__ : "";

/** Clearnet base URL for REST/WS. Injected by Vite; localhost in dev builds. */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:8443";

/**
 * Resolve the REST/WS base URL for the active transport. When Tor is the live
 * transport and a relay onion was baked into this build, dial the relay `.onion`
 * directly so traffic actually rides the hidden service; otherwise fall back to
 * the clearnet SERVER_URL.
 */
export function getServerUrl(transport: TransportState): string {
  if (transport === "tor" && RELAY_ONION_ADDRESS) {
    return `http://${RELAY_ONION_ADDRESS}`;
  }
  return SERVER_URL;
}
