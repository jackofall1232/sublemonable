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
export const ANDROID_BETA_VERSION = "v1.5.0-beta";
export const ANDROID_BETA_APK_URL = `${GITHUB_URL}/releases/download/${ANDROID_BETA_VERSION}/sublemonable-${ANDROID_BETA_VERSION}.apk`;
// 64 hex chars. Must be byte-identical to onion-site/SHA256SUMS — both surfaces
// must serve the same binary. Verify: sha256sum onion-site/sublemonable-v1.5.0-beta.apk
export const ANDROID_BETA_SHA256 = "16993e8d1beb42b2e2888113631db779d060755afc027abd8885ee4e73f10a5e";
export const ANDROID_BETA_MIN_OS = "Android 8.0 (Oreo)";

// ── Tor download mirror ───────────────────────────────────────────────────────
// Public .onion address for the APK download mirror (served by the Tor hidden
// service overlay). This is the publicly-published address — never the relay or
// secret mirror addresses, which are never rendered into any public page.
export const PUBLIC_MIRROR_ONION = "wyymleg2e3mdhib4twyu7bgofyxbtoj52jfycc4ihqc7atapxyj3kuqd.onion";
