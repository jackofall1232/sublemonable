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

# No logging in release: strip any stray android.util.Log calls defensively.
# (The codebase contains none by policy, this enforces it at build time.)
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
    public static int wtf(...);
}
