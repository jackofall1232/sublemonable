// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { LemonSlice } from "@/components/LemonSlice";
import { ParticleField } from "@/components/ParticleField";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg-primary px-6 pt-16">
      <ParticleField />

      {/* Ambient lemon glow behind the slice */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 animate-glow-pulse bg-gradient-lemon-glow"
      />

      <motion.div
        aria-hidden
        className="relative mb-10 drop-shadow-[0_0_60px_rgba(245,230,66,0.25)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 120, ease: "linear", repeat: Infinity }}
      >
        <LemonSlice size={220} label="" className="h-[160px] w-[160px] sm:h-[220px] sm:w-[220px]" />
      </motion.div>

      <motion.h1
        className="text-center font-display font-bold tracking-display text-ink-primary"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="block text-5xl sm:text-hero">Nothing lasts.</span>
        <span className="mt-2 block text-5xl text-lemon sm:text-hero">That&apos;s the point.</span>
      </motion.h1>

      <motion.p
        className="mt-8 max-w-xl text-center text-lg leading-relaxed text-ink-secondary"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        Sublemonable is end-to-end encrypted messaging that disappears. No logs. No screenshots. No
        trace.
      </motion.p>

      <motion.div
        className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Link href="/download" className="btn-lemon">
          Get the app
        </Link>
        <Link href="/#how-it-works" className="btn-ghost">
          How it works
        </Link>
      </motion.div>
    </section>
  );
}
