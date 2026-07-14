#!/usr/bin/env bash
# Sublemonable — Copyright (C) 2026 Sublemonable contributors
# Licensed under the GNU Affero General Public License v3.0 or later.
# SPDX-License-Identifier: AGPL-3.0-only
#
# One-command Android release for the relay box — the machine that holds the
# release keystore and hosts the Tor onion mirror. Runs the whole runbook in
# docs/RELEASING_ANDROID.md (Option A) end to end:
#
#   1. asserts the checkout's versionName/versionCode match the tag being cut
#   2. verifies signing-key CONTINUITY before building (same cert digest that
#      signed v1.0.0-beta and v1.5.0-beta — a different key would brick updates
#      for every existing install)
#   3. builds a signed release APK (gradle signingConfig via env vars; the
#      passwords are prompted, never written to disk)
#   4. re-verifies the built APK's signature and cert digest with apksigner
#   5. stages the APK + SHA256SUMS into onion-site/ (the mirror picks it up on
#      the next request — no server restart needed)
#   6. publishes the GitHub Release when GITHUB_TOKEN is set, or prints the
#      exact manual upload steps when it is not
#
# Usage (on the box, from anywhere inside the repo checkout, on current main):
#
#   git pull origin main            # the build ships whatever is checked out
#   RELEASE_TAG=v1.5.1 scripts/release-android-on-box.sh
#
# Optional environment overrides:
#   RELEASE_TAG            tag to release (default: v<versionName> from gradle)
#   KEYSTORE_FILE          path to release .jks (default: /root/sublemonable-release.jks,
#                          falling back to ~/onion-key-backup/sublemonable-release.jks)
#   KEY_ALIAS              keystore alias (default: sublemonable)
#   RELAY_ONION_ADDRESS    relay onion baked into the build (default: read from repo .env)
#   EXPECTED_CERT_SHA256   pinned signing-cert digest (default: the digest that has
#                          signed every release so far — override ONLY for a deliberate,
#                          breaking key rotation)
#   GITHUB_TOKEN           when set, the release is created and assets uploaded via the
#                          GitHub API; when unset, manual upload steps are printed
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "==> $*"; }

# The cert that signed v1.0.0-beta and v1.5.0-beta (published in the v1.0.0-beta
# release notes; re-verified against the keystore in the 2026-07-02 release run).
# Signing with anything else forces every tester to uninstall — wiping their
# identity keys and history — so both the keystore and the built APK are checked
# against this digest and the script refuses to continue on a mismatch.
EXPECTED_CERT_SHA256="${EXPECTED_CERT_SHA256:-6c7f92a7b817f8ab975d0ac9ca8ff1d42641311a07aabd2a4142c21722892753}"
KEY_ALIAS="${KEY_ALIAS:-sublemonable}"

norm_hex() { printf '%s' "$1" | tr 'A-F' 'a-f' | tr -cd '0-9a-f'; }

# ── Locate the repo and read the version the checkout will build ─────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this from inside the sublemonable checkout"
cd "$REPO_ROOT"
GRADLE_FILE="apps/android/app/build.gradle.kts"
[ -f "$GRADLE_FILE" ] && [ -x apps/android/gradlew ] || fail "missing $GRADLE_FILE or gradle wrapper — wrong directory?"

VERSION_NAME="$(grep -oP 'versionName\s*=\s*"\K[^"]+' "$GRADLE_FILE")" || fail "could not read versionName from $GRADLE_FILE"
VERSION_CODE="$(grep -oP 'versionCode\s*=\s*\K[0-9]+' "$GRADLE_FILE")" || fail "could not read versionCode from $GRADLE_FILE"
RELEASE_TAG="${RELEASE_TAG:-v$VERSION_NAME}"

# Same rule the CI workflow enforces: the tag must be v<versionName> or
# v<versionName>-beta, because links.ts derives the asset filename and the
# page's displayed version straight from the tag.
case "$RELEASE_TAG" in
  "v$VERSION_NAME" | "v$VERSION_NAME-beta") : ;;
  *) fail "tag '$RELEASE_TAG' does not match versionName '$VERSION_NAME' (expected 'v$VERSION_NAME' or 'v$VERSION_NAME-beta'). Did you forget to git pull main?" ;;
esac
note "Releasing $RELEASE_TAG (versionName $VERSION_NAME, versionCode $VERSION_CODE) from $(git rev-parse --short HEAD)"

# ── Relay onion address (baked into the build; NEVER committed/published) ────
if [ -z "${RELAY_ONION_ADDRESS:-}" ] && [ -f .env ]; then
  RELAY_ONION_ADDRESS="$(grep -oP '^RELAY_ONION_ADDRESS=\K.*' .env | tr -d '"' || true)"
fi
[ -n "${RELAY_ONION_ADDRESS:-}" ] || fail "RELAY_ONION_ADDRESS is empty and not found in .env — the previous beta shipped with it baked in; building without it would regress Tor-first transport. Export it or fix .env."
export RELAY_ONION_ADDRESS

# ── Keystore: locate, prompt for passwords, verify continuity BEFORE building ─
KEYSTORE_FILE="${KEYSTORE_FILE:-}"
if [ -z "$KEYSTORE_FILE" ]; then
  for cand in /root/sublemonable-release.jks "$HOME/onion-key-backup/sublemonable-release.jks"; do
    [ -f "$cand" ] && KEYSTORE_FILE="$cand" && break
  done
fi
[ -n "$KEYSTORE_FILE" ] && [ -f "$KEYSTORE_FILE" ] || fail "release keystore not found (tried /root/sublemonable-release.jks and ~/onion-key-backup/). Set KEYSTORE_FILE=/path/to/release.jks"
command -v keytool >/dev/null || fail "keytool not on PATH (need a JDK, 17+)"
note "Keystore: $KEYSTORE_FILE (alias: $KEY_ALIAS)"

read -rsp "Keystore password: " STORE_PASS; echo
read -rsp "Key password (enter to reuse keystore password): " KEY_PASS; echo
KEY_PASS="${KEY_PASS:-$STORE_PASS}"

# keytool prints "SHA256: AA:BB:..." — normalize and compare to the pinned digest.
KS_CERT="$(LC_ALL=C keytool -list -v -keystore "$KEYSTORE_FILE" -alias "$KEY_ALIAS" -storepass "$STORE_PASS" 2>/dev/null \
  | grep -m1 'SHA256:' | awk '{print $2}')" || true
[ -n "$KS_CERT" ] || fail "could not read the certificate from the keystore (wrong password or alias?)"
if [ "$(norm_hex "$KS_CERT")" != "$(norm_hex "$EXPECTED_CERT_SHA256")" ]; then
  fail "keystore cert ($KS_CERT) does NOT match the key that signed previous releases ($EXPECTED_CERT_SHA256). Signing with it would break updates for every install. Stopping."
fi
note "Keystore certificate matches the release signing key — continuity OK."

# ── Build (signed via env vars; nothing secret touches the filesystem) ───────
note "Building :app:assembleRelease ..."
(
  cd apps/android
  ANDROID_KEYSTORE_FILE="$KEYSTORE_FILE" \
  ANDROID_KEYSTORE_PASSWORD="$STORE_PASS" \
  ANDROID_KEY_ALIAS="$KEY_ALIAS" \
  ANDROID_KEY_PASSWORD="$KEY_PASS" \
  ./gradlew --no-daemon :app:assembleRelease
)
APK_SRC="apps/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK_SRC" ] || fail "expected signed output $APK_SRC not found (an app-release-unsigned.apk means the signing config was not picked up)"

# ── Verify the artifact: signature, cert continuity, embedded version ────────
find_buildtool() { # newest build-tools copy of $1, or $1 from PATH
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" hit=""
  if [ -n "$sdk" ]; then
    hit="$(ls -1 "$sdk"/build-tools/*/"$1" 2>/dev/null | sort -V | tail -1 || true)"
  fi
  [ -n "$hit" ] && { echo "$hit"; return; }
  command -v "$1" || true
}
APKSIGNER="$(find_buildtool apksigner)"
[ -n "$APKSIGNER" ] || fail "apksigner not found (looked in \$ANDROID_HOME/build-tools and PATH)"
"$APKSIGNER" verify --print-certs "$APK_SRC" >/dev/null || fail "apksigner verify FAILED on the built APK"
APK_CERT="$("$APKSIGNER" verify --print-certs "$APK_SRC" 2>/dev/null \
  | grep -Eio 'certificate SHA-256 digest: [0-9a-f]+' | head -1 | awk '{print $NF}')" || true
[ -n "$APK_CERT" ] || fail "could not extract the certificate SHA-256 digest from the built APK"
[ "$(norm_hex "$APK_CERT")" = "$(norm_hex "$EXPECTED_CERT_SHA256")" ] \
  || fail "built APK signed by unexpected cert ($APK_CERT) — refusing to stage or publish"
note "APK signature verified; signer cert matches the release key."

AAPT2="$(find_buildtool aapt2)"
if [ -n "$AAPT2" ]; then
  BADGING="$("$AAPT2" dump badging "$APK_SRC" | head -1)"
  echo "$BADGING" | grep -q "versionCode='$VERSION_CODE'" || fail "artifact versionCode does not match $VERSION_CODE: $BADGING"
  echo "$BADGING" | grep -q "versionName='$VERSION_NAME'" || fail "artifact versionName does not match $VERSION_NAME: $BADGING"
  note "Artifact carries versionCode $VERSION_CODE / versionName $VERSION_NAME."
else
  note "aapt2 not found — skipping embedded-version check (gradle-side assert already passed)."
fi

# ── Name, checksum, and stage into the Tor mirror ────────────────────────────
APK_NAME="sublemonable-$RELEASE_TAG.apk"
cp "$APK_SRC" "$APK_NAME"
APK_SHA256="$(sha256sum "$APK_NAME" | cut -d' ' -f1)"

# Drop the previous build FIRST: the mirror serves the first *.apk it finds
# (server/cmd/server/onion.go findStagedAPK), so a leftover older APK would
# keep shipping. Basenames in SHA256SUMS so testers' `sha256sum -c` matches.
rm -f onion-site/*.apk
cp "$APK_NAME" onion-site/
( cd onion-site && sha256sum -- *.apk > SHA256SUMS )
note "Staged onion-site/$APK_NAME + SHA256SUMS (mirror serves it on the next request)."

# ── Publish the GitHub Release ────────────────────────────────────────────────
NOTES="Sublemonable Android $RELEASE_TAG.

Verify before installing:
- APK SHA-256: \`$APK_SHA256\` (\`sha256sum $APK_NAME\`)
- Signing certificate SHA-256: \`$APK_CERT\` (\`apksigner verify --print-certs $APK_NAME\`)

Also available from the Tor onion mirror (same binary, same checksum)."

if [ -n "${GITHUB_TOKEN:-}" ]; then
  command -v curl >/dev/null || fail "curl not on PATH"
  command -v python3 >/dev/null || fail "python3 not on PATH (needed for JSON encoding/parsing)"
  API="https://api.github.com/repos/jackofall1232/sublemonable"
  AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")
  # Never clobber a live release's assets in place — same rule as the CI workflow.
  if curl -fsS "${AUTH[@]}" "$API/releases/tags/$RELEASE_TAG" >/dev/null 2>&1; then
    fail "a release for $RELEASE_TAG already exists — delete it deliberately or cut a new tag"
  fi
  note "Creating GitHub prerelease $RELEASE_TAG ..."
  RELEASE_JSON="$(curl -fsS "${AUTH[@]}" -X POST "$API/releases" \
    -d "$(printf '{"tag_name":"%s","target_commitish":"main","name":"%s","prerelease":true,"body":%s}' \
          "$RELEASE_TAG" "$RELEASE_TAG" "$(printf '%s' "$NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")")"
  UPLOAD_URL="$(printf '%s' "$RELEASE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["upload_url"].split("{")[0])')"
  for asset in "$APK_NAME" onion-site/SHA256SUMS; do
    note "Uploading $(basename "$asset") ..."
    curl -fsS "${AUTH[@]}" -H "Content-Type: application/octet-stream" \
      --data-binary @"$asset" "$UPLOAD_URL?name=$(basename "$asset")" >/dev/null
  done
  note "Release published: https://github.com/jackofall1232/sublemonable/releases/tag/$RELEASE_TAG"
else
  cat <<EOF

── No GITHUB_TOKEN set — publish manually (same as last time) ─────────────────
1. Open https://github.com/jackofall1232/sublemonable/releases/new
2. Tag: $RELEASE_TAG (target: main) · Title: $RELEASE_TAG · check "pre-release"
3. Upload BOTH files from $REPO_ROOT:
     $APK_NAME
     onion-site/SHA256SUMS
4. Paste into the notes:
$NOTES
────────────────────────────────────────────────────────────────────────────────
EOF
fi

cat <<EOF

DONE. Values the website needs (website/src/lib/links.ts):
  ANDROID_BETA_VERSION = "$RELEASE_TAG"
  ANDROID_BETA_SHA256  = "$APK_SHA256"
The cloud session watches for the published release and flips the website
pointer automatically — no further action needed here once the release is live.
EOF
