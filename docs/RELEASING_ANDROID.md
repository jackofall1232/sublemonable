# Releasing the Android beta APK

The registration/QR/connection fix ([#14](https://github.com/jackofall1232/sublemonable/pull/14))
and the `1.5.1` version bump ([#15](https://github.com/jackofall1232/sublemonable/pull/15)) are in
`main`, but a fix in source is not a fix in testers' hands. `/download/beta` serves whatever binary
was last uploaded as a GitHub Release asset — until a signed `v1.5.1` APK is built and published,
the download link keeps handing out the pre-fix `v1.5.0-beta` build. This is the runbook that closes
that gap.

## Signing-key custody

By default the release **signing key never exists in this session or in CI**: it is the app's trust
anchor, and whoever holds it can impersonate the app to every install. Keep it on hardware you
control and sign there (Option A). CI signing is possible **only if you deliberately opt in** —
placing the key in GitHub Secrets behind a protected environment (Option B) — a custody tradeoff you
choose, not the default. Either way, two hard rules follow:

- **Reuse the same keystore that signed the previous release.** Android refuses to install an update
  whose signature differs from the installed app (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`); a fresh key
  forces every tester to uninstall first, which for this app **wipes their local identity keys and
  message history**. Rotating the signing identity is a one-way, breaking event.
- **`versionCode` must strictly increase.** It is `3` for 1.5.1 (was `2` for 1.5.0-beta). Confirm
  before you build.

## Pre-flight checks (do these once)

```bash
# 1. What signed the live beta? Note the SHA-256 cert digest.
apksigner verify --print-certs sublemonable-v1.5.0-beta.apk

# 2. What will sign the new build? Must be the SAME digest as above.
keytool -list -v -keystore release.jks -alias sublemonable    # compare SHA256 fingerprint
```

If those two digests differ, stop — signing 1.5.1 with a different key breaks every existing install.

## Option A — build & sign locally (recommended, key never leaves your machine)

`app/build.gradle.kts` picks up signing material from a gitignored `keystore.properties`:

```bash
cd apps/android
cp keystore.properties.example keystore.properties   # then edit: storeFile / passwords / alias
./gradlew :app:assembleRelease
```

The output is already zipaligned and signed:

```
apps/android/app/build/outputs/apk/release/app-release.apk
```

Verify and checksum it:

```bash
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
cp app/build/outputs/apk/release/app-release.apk sublemonable-v1.5.1.apk
sha256sum sublemonable-v1.5.1.apk    # keep this value — the website needs it
```

> Without `keystore.properties` (or the equivalent env vars) the release build still succeeds but is
> **unsigned** (`app-release-unsigned.apk`) — installable only after you sign it yourself.

## Option B — build in CI (`.github/workflows/release-apk.yml`)

Only choose this if you accept putting the keystore in GitHub Secrets. Add these secrets (ideally
behind the `android-release` Environment with a required reviewer, so no run can read them
unreviewed):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.jks \| tr -d '\n'` (portable; GNU `base64 -w0` also works) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |
| `ANDROID_SIGNING_CERT_SHA256` _(optional)_ | The previous release's signing-cert SHA-256 (the digest from the pre-flight check). When set, the workflow **aborts before publishing** if the built APK's signing cert differs — a guardrail against an accidental key change slipping through the environment approval. |

Then push a tag (`git tag v1.5.1 && git push origin v1.5.1`) or run the workflow via
**Actions → Release APK → Run workflow**. The workflow builds + signs, verifies the signature, prints
the signing cert and the exact `links.ts` values in the run summary, and publishes a prerelease with
the APK + `SHA256SUMS`.

If **no** secrets are set, the same workflow instead uploads an **unsigned** APK as a build artifact
plus offline `zipalign`→`apksigner` instructions — so you can build in CI but keep signing on trusted
hardware. Caveat: anyone with write access to workflow files can exfiltrate a secret a workflow can
read; the Environment gate is the mitigation.

## Tag naming

`versionName` is `1.5.1` (the `1.5.0-beta` release used versionName `1.5.0-beta`). The workflow
asserts the tag equals `v<versionName>` or `v<versionName>-beta`, so either **`v1.5.1`** or
**`v1.5.1-beta`** is accepted. Pick one and stay consistent — `links.ts` builds the asset filename
and the page's displayed version straight from the tag, so the tag, the Release, and the website must
all use the same string.

## Publish: flip the website pointer (only after the APK exists)

Do this **last** — flipping the pointer before the asset is uploaded 404s testers.

1. In `website/src/lib/links.ts` set both:
   ```ts
   export const ANDROID_BETA_VERSION = "v1.5.1";       // your chosen tag
   export const ANDROID_BETA_SHA256  = "<sha256sum of the signed apk>";
   ```
2. Stage the same binary into the Tor mirror so both surfaces serve an identical, matching-checksum
   file (see [`SELF_HOSTING.md`](SELF_HOSTING.md#stage-the-apk-required-for-the-mirrors-to-show-a-download-link)):
   ```bash
   rm -f onion-site/*.apk            # drop the previous build FIRST: the mirror serves
                                     # the first *.apk it finds (server/cmd/server/onion.go
                                     # findStagedAPK), so a leftover older APK keeps shipping
   cp sublemonable-v1.5.1.apk onion-site/
   sha256sum onion-site/*.apk > onion-site/SHA256SUMS
   ```
3. Commit and push — Vercel redeploys and `/download/beta` serves the fixed build.

Publish the signing cert's SHA-256 digest alongside the checksum in the release notes: for a
sideloaded privacy app, that fingerprint is how testers confirm the APK is genuinely yours.
