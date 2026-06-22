// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Build-time configuration injected by Vite (see vite.config.ts).

/**
 * The relay onion address. NEVER published in docs or committed to source — it
 * is baked into the app at build time via VITE_RELAY_ONION_ADDRESS so the relay
 * hidden service is not discoverable from the repository. Empty when the build
 * did not set it (e.g. clearnet-only dev builds).
 */
export const RELAY_ONION_ADDRESS: string =
  // @ts-expect-error injected by vite define
  typeof __RELAY_ONION_ADDRESS__ !== "undefined" ? __RELAY_ONION_ADDRESS__ : "";
