// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import sodium from "libsodium-wrappers-sumo";

/** Await libsodium's WASM initialization before any crypto call. */
export async function ready(): Promise<void> {
  await sodium.ready;
}

export { sodium };
