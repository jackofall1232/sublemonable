// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      // libsodium.js ships a broken ESM entry (imports a libsodium.mjs that
      // isn't packaged) — alias to the working CJS build.
      "libsodium-wrappers-sumo": require.resolve("libsodium-wrappers-sumo"),
    },
  },
  test: {
    environment: "node",
  },
});
