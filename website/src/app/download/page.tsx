// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import { LemonSlice } from "@/components/LemonSlice";
import { GITHUB_URL, SELF_HOSTING_DOC } from "@/lib/links";

export const metadata: Metadata = {
  title: "Download — Sublemonable",
  description:
    "Get Sublemonable for iOS, Android, or the browser. Or self-host the whole thing — it's open source.",
};

function StoreBadge({ store, line1 }: { store: string; line1: string }) {
  return (
    <div
      className="flex w-52 cursor-not-allowed items-center gap-3 rounded-md border border-line bg-bg-elevated px-5 py-3 opacity-80"
      aria-disabled
    >
      <LemonSlice size={28} label="" segments={0} />
      <div className="text-left">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">{line1}</div>
        <div className="font-display text-base font-semibold text-ink-primary">{store}</div>
      </div>
    </div>
  );
}

export default function DownloadPage() {
  return (
    <main className="bg-bg-primary px-6 pb-28 pt-32">
      <div className="mx-auto max-w-3xl">
        <LemonSlice size={56} label="" />
        <h1 className="mt-8 font-display text-4xl font-bold tracking-display text-ink-primary sm:text-5xl">
          Get the app
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink-secondary">
          Several ways to run Sublemonable — mobile, desktop, or the browser. And, if you count
          running the entire thing yourself, one more — which we encourage.
        </p>

        {/* App stores */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            iOS and Android
          </h2>
          <p className="mt-3 leading-relaxed text-ink-secondary">
            The mobile apps aren&apos;t in the stores yet. The badges below will light up when they
            are — segments and all.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <StoreBadge line1="Coming soon to the" store="App Store" />
            <StoreBadge line1="Coming soon to" store="Google Play" />
          </div>
        </section>

        {/* PWA */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            Browser — no install needed
          </h2>
          <p className="mt-3 leading-relaxed text-ink-secondary">
            The web app is a full client: keys generated and stored in your browser, messages
            encrypted before they leave it. It&apos;s also an installable PWA — open it, and your
            browser will offer to add it to your home screen or dock (look for{" "}
            <span className="text-ink-primary">&ldquo;Install app&rdquo;</span> in the address bar
            on desktop, or <span className="text-ink-primary">Share → Add to Home Screen</span> on
            mobile). Installed, it works offline for composing: outbound messages queue locally and
            send when you reconnect. Only the UI is cached — never your messages.
          </p>
        </section>

        {/* Linux desktop */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            Linux — .deb, .AppImage, .rpm
          </h2>
          <p className="mt-3 leading-relaxed text-ink-secondary">
            A native desktop app built with Tauri — no bundled Chromium, just a small Rust backend.
            The <span className="text-ink-primary">.deb</span> is the primary package for Debian,
            Ubuntu, Kali Linux, Parrot OS, and Pop!_OS. The{" "}
            <span className="text-ink-primary">.AppImage</span> is universal — it runs on any distro
            without installing. An <span className="text-ink-primary">.rpm</span> is also produced
            for Fedora and RHEL (community-supported).
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a
              href={`${GITHUB_URL}/releases/latest`}
              className="w-52 rounded-md border border-line bg-bg-elevated px-5 py-3 text-left transition duration-base ease-brand hover:border-lemon hover:text-lemon"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                Debian · Ubuntu · Kali
              </div>
              <div className="font-display text-base font-semibold text-ink-primary">
                Download .deb
              </div>
            </a>
            <a
              href={`${GITHUB_URL}/releases/latest`}
              className="w-52 rounded-md border border-line bg-bg-elevated px-5 py-3 text-left transition duration-base ease-brand hover:border-lemon hover:text-lemon"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                Any Linux distro
              </div>
              <div className="font-display text-base font-semibold text-ink-primary">
                Download .AppImage
              </div>
            </a>
            <a
              href={`${GITHUB_URL}/releases/latest`}
              className="w-52 rounded-md border border-line bg-bg-elevated px-5 py-3 text-left transition duration-base ease-brand hover:border-lemon hover:text-lemon"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                Fedora · RHEL (community)
              </div>
              <div className="font-display text-base font-semibold text-ink-primary">
                Download .rpm
              </div>
            </a>
          </div>
          <p className="mt-5 leading-relaxed text-ink-secondary">
            On <span className="text-ink-primary">Wayland</span> (GNOME, KDE Plasma) the desktop app
            applies an OS-level screenshot hard block — the same protection as Android FLAG_SECURE.
            On X11 that protection is best-effort, so prefer a Wayland session for confidential use.
          </p>
        </section>

        {/* Self-host */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold tracking-display text-ink-primary">
            Self-host it
          </h2>
          <p className="mt-3 leading-relaxed text-ink-secondary">
            Don&apos;t want to trust our server? Good instinct. Run your own — it&apos;s a Go
            binary, a Postgres database, and a Docker Compose file:
          </p>
          <pre className="mt-6 overflow-x-auto rounded-md border border-line bg-bg-secondary p-5 font-mono text-sm leading-relaxed text-pulp">
            <code>{`git clone ${GITHUB_URL}.git
cd sublemonable
cp .env.example .env   # set DATABASE_URL, JWT key paths, TLS paths
docker compose up -d   # server + postgres
# optional Tor hidden service:
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d`}</code>
          </pre>
          <p className="mt-5 leading-relaxed text-ink-secondary">
            Full instructions — TLS setup, environment variables, the optional Tor hidden service,
            backups — are in the{" "}
            <a
              href={SELF_HOSTING_DOC}
              className="text-lemon underline decoration-lemon/40 underline-offset-4 transition duration-base hover:decoration-lemon"
            >
              self-hosting guide
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
