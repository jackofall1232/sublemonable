// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

const PLATFORMS = ["iOS", "Android", "Browser — no install needed"];

export function PlatformBadges() {
  return (
    <section className="bg-bg-primary px-6 py-20">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4">
        {PLATFORMS.map((platform) => (
          <span
            key={platform}
            className="rounded-pill border border-line bg-bg-elevated px-6 py-3 font-mono text-sm text-ink-primary transition duration-base ease-brand hover:border-lemon hover:text-lemon"
          >
            {platform}
          </span>
        ))}
      </div>
    </section>
  );
}
