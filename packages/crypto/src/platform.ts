// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Runtime platform detection. Lets shared code (e.g. apps/web storage) choose
// the correct storage backend: IndexedDB in a plain browser, or the Tauri
// keystore commands (libsecret / file fallback) when running inside the
// Linux desktop app. Detection is purely a feature check — no telemetry.

/**
 * True when the code is executing inside a Tauri webview (the desktop app).
 * Tauri v2 injects `__TAURI_INTERNALS__` onto `window`; its presence is the
 * canonical way to detect the desktop host without bundling any Tauri SDK.
 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
