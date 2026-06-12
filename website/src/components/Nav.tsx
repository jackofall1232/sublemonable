// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link";
import { LemonSlice } from "@/components/LemonSlice";
import { GITHUB_URL } from "@/lib/links";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-bg-primary/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-3">
          <LemonSlice
            size={28}
            label=""
            className="transition duration-slow ease-brand group-hover:rotate-45"
          />
          <span className="font-display text-lg font-semibold tracking-display text-ink-primary">
            SUBLEMONABLE
          </span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link
            href="/security"
            className="hidden text-ink-secondary transition duration-base hover:text-lemon sm:block"
          >
            Security
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-ink-secondary transition duration-base hover:text-lemon sm:block"
          >
            GitHub
          </a>
          <Link
            href="/download"
            className="rounded-pill bg-lemon px-4 py-2 font-medium text-ink-onlemon transition duration-base ease-brand hover:bg-lemon-bright hover:shadow-lemon-sm"
          >
            Get the app
          </Link>
        </div>
      </nav>
    </header>
  );
}
