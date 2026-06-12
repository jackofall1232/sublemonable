// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import { motion } from "framer-motion";
import { LemonSlice } from "@/components/LemonSlice";

// Copy is verbatim from sublemonable-MASTER.json -> marketing_site.pages.home.how_it_works
const STEPS = [
  {
    label: "Generate keys",
    description: "Your device creates your identity. Keys never leave your device.",
  },
  {
    label: "Exchange codes",
    description: "Share a QR or link. No personal info changes hands.",
  },
  {
    label: "Send encrypted",
    description: "Every message encrypted locally before sending.",
  },
  {
    label: "Delivered and deleted",
    description: "Server purges message the instant it's delivered.",
  },
  {
    label: "Gone forever",
    description: "Set to burn, or burn on read. Nothing stays.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-line bg-bg-secondary px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          className="font-display text-3xl font-semibold tracking-display text-ink-primary sm:text-4xl"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          How it works
        </motion.h2>
        <p className="mt-4 max-w-md text-ink-secondary">
          Five steps. Zero knowledge on our end, start to finish.
        </p>

        <div className="mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-6 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              className="flex w-64 shrink-0 snap-start flex-col gap-4 rounded-lg border border-line bg-bg-elevated p-6 shadow-card lg:w-auto"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center gap-3">
                <LemonSlice size={32} segments={i + 1} label="" />
                <span className="font-mono text-xs text-ink-muted">0{i + 1}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink-primary">{step.label}</h3>
              <p className="text-sm leading-relaxed text-ink-secondary">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
