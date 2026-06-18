// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import Link from "next/link";
import { LemonSlice } from "@/components/LemonSlice";
import {
  ANDROID_BETA_APK_URL,
  ANDROID_BETA_MIN_OS,
  ANDROID_BETA_SHA256,
  ANDROID_BETA_VERSION,
  GITHUB_ISSUES,
} from "@/lib/links";

// Unlisted: shared by direct link with testers only, and kept out of search
// indexes and the sitemap. This is a temporary page — delete it at store launch.
export const metadata: Metadata = {
  title: "Android beta — Sublemonable",
  description: "Sideload the Sublemonable Android beta for testing.",
  robots: { index: false, follow: false },
};

export default function AndroidBetaPage() {
  return (
    <main className="bg-bg-primary px-6 pb-28 pt-32">
      <div className="mx-auto max-w-3xl">
        <LemonSlice size={56} label="" />

        <p className="mt-8 font-mono text-[11px] uppercase tracking-wide text-ink-muted">
          Private beta · {ANDROID_BETA_VERSION}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-display text-ink-primary sm:text-5xl">
          Android beta
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink-secondary">
          A sideloaded build for testers, ahead of the Google Play release. It connects to the{" "}
          <span className="text-ink-primary">relay.sublemonable.com</span> server and pins that
          server&apos;s certificate — so this build only talks to that relay.
        </p>

        {/* Pre-release warning */}
        <div className="mt-8 rounded-md border border-lemon/40 bg-bg-elevated p-5">
          <p className="font-display text-base font-semibold text-lemon">This is a pre-release.</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-ink-secondary">
            <li>Expect bugs, breaking changes, and data resets between builds.</li>
            <li>Not distributed through Google Play — you install it manually (sideload).</li>
            <li>It is unaffiliated with the Play Store and receives no automatic updates.</li>
          </ul>
        </div>

        {/* Download */}
        <section className="mt-12">
          <a
            href={ANDROID_BETA_APK_URL}
            className="inline-flex items-center gap-3 rounded-md border border-line bg-bg-elevated px-6 py-4 text-left transition duration-base ease-brand hover:border-lemon hover:text-lemon"
          >
            <LemonSlice size={32} label="" />
            <span>
              <span className="block font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                Direct download · {ANDROID_BETA_MIN_OS}+
              </span>
              <span className="block font-display text-lg font-semibold text-ink-primary">
                Download .apk ({ANDROID_BETA_VERSION})
              </span>
            </span>
          </a>

          {/* Checksum */}
          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">
              SHA-256 checksum
            </p>
            {ANDROID_BETA_SHA256 ? (
              <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-bg-secondary p-4 font-mono text-sm text-pulp">
                <code>{ANDROID_BETA_SHA256}</code>
              </pre>
            ) : (
              <p className="mt-2 leading-relaxed text-ink-secondary">
                Published with the release once the build is uploaded. Verify before installing.
              </p>
            )}
            <p className="mt-3 leading-relaxed text-ink-secondary">
              Verify the file you downloaded matches:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-bg-secondary p-4 font-mono text-sm leading-relaxed text-pulp">
              <code>{`sha256sum sublemonable-${ANDROID_BETA_VERSION}.apk`}</code>
            </pre>
          </div>
        </section>

        {/* Install steps */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            Installing
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed text-ink-secondary">
            <li>Download the .apk to your Android device (or transfer it over).</li>
            <li>
              Open it. Android will ask to allow installs from your browser or file manager — grant{" "}
              <span className="text-ink-primary">Install unknown apps</span> for that app (Settings
              → Apps → Special access → Install unknown apps).
            </li>
            <li>Confirm the install. Play Protect may warn you because the app is sideloaded.</li>
            <li>
              To update, download a newer .apk and install over the top — verify its checksum each
              time.
            </li>
          </ol>
        </section>

        {/* Feedback */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            Found a bug?
          </h2>
          <p className="mt-3 leading-relaxed text-ink-secondary">
            File it on{" "}
            <a
              href={GITHUB_ISSUES}
              className="text-lemon underline decoration-lemon/40 underline-offset-4 transition duration-base hover:decoration-lemon"
            >
              GitHub Issues
            </a>
            . For anything security-sensitive, do not open a public issue — follow the responsible
            disclosure process instead. Never include message content or screenshots that reveal it.
          </p>
        </section>

        <p className="mt-16 text-sm leading-relaxed text-ink-muted">
          Looking for the other platforms?{" "}
          <Link
            href="/download"
            className="text-ink-secondary underline decoration-line underline-offset-4 transition duration-base hover:text-lemon hover:decoration-lemon"
          >
            Back to downloads
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
