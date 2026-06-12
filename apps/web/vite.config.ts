// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // libsodium.js ships a broken ESM entry — use the CJS build (Vite
      // pre-bundles it cleanly for the browser).
      "libsodium-wrappers-sumo": require.resolve("libsodium-wrappers-sumo"),
    },
  },
  build: {
    sourcemap: true,
    target: "es2022",
  },
});
