// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link";
import { LemonSlice } from "@/components/LemonSlice";
import { GITHUB_URL, SELF_HOSTING_DOC } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg-primary">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-14 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3">
          <LemonSlice size={32} label="Sublemonable" />
          <p className="font-display text-sm font-medium text-ink-secondary">
            Sublemonable. Nothing lasts.
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-secondary transition duration-base hover:text-lemon"
          >
            GitHub
          </a>
          <Link
            href="/security"
            className="text-ink-secondary transition duration-base hover:text-lemon"
          >
            Security Model
          </Link>
          <Link
            href="/privacy"
            className="text-ink-secondary transition duration-base hover:text-lemon"
          >
            Privacy Policy
          </Link>
          <a
            href={SELF_HOSTING_DOC}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-secondary transition duration-base hover:text-lemon"
          >
            Self-host
          </a>
        </nav>
      </div>
      <div className="border-t border-line/60 py-5 text-center font-mono text-xs text-ink-muted">
        AGPL-3.0 · No analytics. No trackers. Obviously.
      </div>
    </footer>
  );
}
