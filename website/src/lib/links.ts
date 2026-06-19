// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

export const GITHUB_URL = "https://github.com/jackofall1232/sublemonable";
export const SECURITY_MODEL_DOC = `${GITHUB_URL}/blob/main/docs/SECURITY_MODEL.md`;
export const SELF_HOSTING_DOC = `${GITHUB_URL}/blob/main/docs/SELF_HOSTING.md`;
export const SECURITY_POLICY = `${GITHUB_URL}/blob/main/SECURITY.md`;
export const AUDIT_LOG = `${GITHUB_URL}/blob/main/AUDIT.md`;
export const GITHUB_ISSUES = `${GITHUB_URL}/issues`;

// ── Android beta (temporary) ─────────────────────────────────────────────────
// Sideloaded beta APK hosted as a GitHub Release asset. After uploading the
// build: set ANDROID_BETA_VERSION to the release tag, name the asset to match
// ANDROID_BETA_APK_URL, and paste the asset's SHA-256 into ANDROID_BETA_SHA256
// (`sha256sum <file>`). Remove this block and the /download/beta page once the
// app ships to the Play Store.
export const ANDROID_BETA_VERSION = "v1.0.0-beta";
export const ANDROID_BETA_APK_URL = `${GITHUB_URL}/releases/download/${ANDROID_BETA_VERSION}/sublemonable-${ANDROID_BETA_VERSION}.apk`;
// 64 hex chars once filled in; the page shows a "pending" note until then.
export const ANDROID_BETA_SHA256 = "3091c7ae1c88a02fd5bf79033125b23148477c7800392e90a64939e20d2ded10";
export const ANDROID_BETA_MIN_OS = "Android 8.0 (Oreo)";
