// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// Release signing material is loaded from `apps/android/keystore.properties`
// (gitignored) or, failing that, from environment variables — so the keystore
// and its passwords never live in the source tree or in this build file. When
// none are provided (debug builds, CI unit tests, contributor checkouts) the
// release build is left UNSIGNED and must be signed out-of-band with apksigner.
// See docs/RELEASING_ANDROID.md.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
fun signingParam(propKey: String, envKey: String): String? =
    keystoreProperties.getProperty(propKey)
        ?: providers.environmentVariable(envKey).orNull
val releaseStoreFilePath = signingParam("storeFile", "ANDROID_KEYSTORE_FILE")
val releaseStorePassword = signingParam("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingParam("keyAlias", "ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingParam("keyPassword", "ANDROID_KEY_PASSWORD")
val releaseSigningParams = listOf(
    releaseStoreFilePath, releaseStorePassword, releaseKeyAlias, releaseKeyPassword,
)
// Sign only when ALL four values are present — gating on the whole set, not just
// storeFile: a keystore path with a missing password/alias would otherwise reach
// the signing config as nulls and fail the build obscurely.
val hasReleaseSigning = releaseSigningParams.all { !it.isNullOrBlank() }
// A partial config is almost always a mistake — fail loudly rather than silently
// falling back to an unsigned build the operator believed was signed.
if (!hasReleaseSigning && releaseSigningParams.any { !it.isNullOrBlank() }) {
    throw GradleException(
        "Incomplete release signing config: provide all of storeFile, storePassword, keyAlias, " +
            "keyPassword (via keystore.properties or the ANDROID_KEYSTORE_FILE / " +
            "ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD env vars), or none. " +
            "See docs/RELEASING_ANDROID.md.",
    )
}

android {
    namespace = "com.sublemonable.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sublemonable.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 3
        versionName = "1.5.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Relay onion address — NEVER published or committed. Injected from the
        // build environment so the relay hidden service stays out of the source
        // tree. Empty string when unset (clearnet/dev builds).
        buildConfigField(
            "String",
            "RELAY_ONION_ADDRESS",
            // providers.environmentVariable (not System.getenv) so Gradle tracks
            // the env var as a build input and the configuration cache stays valid.
            "\"${providers.environmentVariable("RELAY_ONION_ADDRESS").orNull ?: ""}\""
        )
    }

    signingConfigs {
        // Declared only when a full keystore config was provided; otherwise no
        // signing config exists and assembleRelease yields an unsigned apk.
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Sign only when a keystore was supplied (local keystore.properties
            // or CI secrets). A keyless checkout still configures and builds —
            // the release apk is just unsigned. See docs/RELEASING_ANDROID.md.
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            // No special debug behavior: FLAG_SECURE, no-logging and all other
            // security rules apply identically in debug builds.
        }
    }

    compileOptions {
        // Required by org.signal:libsignal-android, which uses APIs that must be
        // desugared to run on minSdk 26.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // Required for the RELAY_ONION_ADDRESS buildConfigField above.
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = libs.versions.composeCompiler.get()
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Core library desugaring runtime (required by libsignal-android).
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)

    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    // Signal Protocol (Double Ratchet + X3DH)
    implementation(libs.libsignal.android)
    implementation(libs.libsignal.client)

    // Networking — WebSocket + certificate pinning
    implementation(libs.okhttp)

    // Encrypted local storage + biometrics
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.biometric)
    // biometric 1.1.0 pulls fragment 1.2.5, which predates ActivityResult support
    // for FragmentActivity; pin a current fragment so registerForActivityResult
    // works correctly (and satisfies lintVitalRelease).
    implementation(libs.androidx.fragment)

    // QR codes for key verification + contact exchange (pure-Java, offline)
    implementation(libs.zxing.core)
    // In-app QR scanner (camera). FOSS, no Play Services — F-Droid-friendly.
    // Keeps the explicit zxing-core pin above (this pulls an older core).
    implementation(libs.zxing.android.embedded)

    // Unit tests (pure JVM logic only)
    testImplementation(libs.junit)
    testImplementation(libs.org.json)
    testImplementation(libs.kotlinx.coroutines.test)
}
