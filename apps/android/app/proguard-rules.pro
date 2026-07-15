# Sublemonable — Copyright (C) 2026 Sublemonable contributors
# Licensed under the GNU Affero General Public License v3.0 or later.
# See the LICENSE file in the repository root for full license text.
# SPDX-License-Identifier: AGPL-3.0-only

# libsignal uses JNI — keep all native-facing classes and their members.
-keep class org.signal.libsignal.** { *; }
-keepclassmembers class org.signal.libsignal.** { *; }

# OkHttp platform-specific warnings (safe to ignore on Android).
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Tink (via androidx.security:security-crypto) references Error Prone build-time
# annotations that aren't on the runtime classpath — safe to ignore.
-dontwarn com.google.errorprone.annotations.**

# ZXing (pure Java).
-keep class com.google.zxing.** { *; }

# RELAY_ONION_ADDRESS is baked into BuildConfig at build time (see
# app/build.gradle.kts). Nothing references it yet (mobile onion direct-dial is
# a future item), so R8 would strip the dead constant and the release APK would
# ship WITHOUT the relay address. Keep the class so the baked value survives.
-keep class com.sublemonable.app.BuildConfig { *; }

# Never obfuscate away the protocol envelope (serialized via org.json by hand,
# so reflection is not used — these rules are belt-and-braces only).
-keep class com.sublemonable.app.data.MessageEnvelope { *; }

# lifecycle-runtime-compose 2.8.x on Compose 1.6.x resolves LocalLifecycleOwner
# by REFLECTING into this compose-ui class. R8 renamed it in the shipped v1.5.1
# release APK (verified in its dex), so the one lifecycle-compose call site —
# Settings — crashed on every open with "CompositionLocal LocalLifecycleOwner
# not present". The app no longer uses lifecycle-compose APIs, but keep the
# reflection target unconditionally so a future direct or transitive use can
# never re-arm the crash. (The library's own conditional -if rule is the thing
# that failed to fire; do not "simplify" this back to the -if form.)
-keep class androidx.compose.ui.platform.AndroidCompositionLocals_androidKt {
    public static *** getLocalLifecycleOwner();
}

# No debug/info logging in release: strip stray android.util.Log calls
# defensively. (The codebase contains none by policy, this enforces it at
# build time.) Warning/error levels are deliberately NOT stripped: the boot
# transport diagnostics in MessagingCoordinator (tag "SublemonableBoot") log
# at Log.w — stage names + transport exception text only, never user data —
# and stripping them made a certificate-pinning failure or dead relay
# completely unobservable in release builds (no client log, no server
# contact), which is exactly the failure mode they exist to diagnose.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
