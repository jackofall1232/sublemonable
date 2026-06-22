// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Build-time configuration injected by Vite (see vite.config.ts).

import type { TransportState } from "@sublemonable/protocol";
import { isTauri } from "@sublemonable/crypto";

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
 *
 * Onion direct-dial is **web-only** (Tor Browser). The desktop app reaches the
 * relay over a local Tor SOCKS proxy while still targeting the pinned clearnet
 * host, so the pinned native transport only accepts https + the pinned API host
 * (see apps/desktop/src-tauri/src/transport.rs). Handing it an http://<onion>
 * URL would make it reject every REST call — so never return an onion URL under
 * Tauri.
 */
export function getServerUrl(transport: TransportState): string {
  if (transport === "tor" && RELAY_ONION_ADDRESS && !isTauri()) {
    // Tolerate an address misconfigured with a scheme prefix so we don't build
    // a malformed "http://http://…" URL.
    const host = RELAY_ONION_ADDRESS.replace(/^https?:\/\//i, "");
    return `http://${host}`;
  }
  return SERVER_URL;
}
