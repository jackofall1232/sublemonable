// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import Link from "next/link";
import { LemonSlice } from "@/components/LemonSlice";

export const metadata: Metadata = {
  title: "Privacy Policy — Sublemonable",
  description:
    "The shortest privacy policy you'll read this year, because there's nothing to collect.",
};

export default function PrivacyPage() {
  return (
    <main className="bg-bg-primary px-6 pb-28 pt-32">
      <article className="prose-security mx-auto max-w-3xl">
        <LemonSlice size={56} label="" />
        <h1 className="mt-8 font-display text-4xl font-bold tracking-display text-ink-primary sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink-secondary">
          Most privacy policies are long because there&apos;s a lot to confess. Ours is short.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>A random account ID (a UUID — not your name, number, or email)</li>
          <li>Your public keys, so other people can start encrypted sessions with you</li>
          <li>Encrypted message envelopes, held only until delivery, then deleted</li>
          <li>Your account creation timestamp</li>
        </ul>

        <h2>What we don&apos;t</h2>
        <ul>
          <li>Message content — we can&apos;t read it, so we can&apos;t collect it</li>
          <li>Your phone number, email, or name — never asked for</li>
          <li>IP addresses or device identifiers</li>
          <li>Contact lists</li>
          <li>
            Analytics, telemetry, or crash reports — there are none, anywhere, including this
            website
          </li>
        </ul>

        <h2>This website</h2>
        <p>
          No cookies, no analytics, no trackers, no third-party scripts beyond font files. We
          don&apos;t know you visited, and we like it that way.
        </p>

        <h2>Deletion</h2>
        <p>
          Delete your account and everything goes with it: prekeys, pending envelopes, the account
          record. Irreversible, immediate, complete.
        </p>

        <p>
          The technical details behind all of this are on the{" "}
          <Link href="/security">security page</Link>.
        </p>
      </article>
    </main>
  );
}
