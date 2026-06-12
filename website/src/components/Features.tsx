// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  BurnVisual,
  KeyExchangeVisual,
  QrVisual,
  ScreenshotVisual,
} from "@/components/FeatureVisuals";

interface Feature {
  headline: string;
  body: string;
  visual: ReactNode;
}

// Copy is verbatim from sublemonable-MASTER.json -> marketing_site.pages.home.features
const FEATURES: Feature[] = [
  {
    headline: "Encrypted before it leaves your hands.",
    body: "Signal Protocol. Every message gets its own key. We store nothing readable. Not because the law says so — because it's technically impossible.",
    visual: <KeyExchangeVisual />,
  },
  {
    headline: "Read it. Watch it go.",
    body: "Burn-on-read. Timed destruction. 30 seconds to a week — your call. The server deletes the moment your recipient gets it.",
    visual: <BurnVisual />,
  },
  {
    headline: "Screenshots? We blur those.",
    body: "Android blocks them entirely. iOS and browser blur your messages the instant a screenshot is attempted. We also watermark every conversation — if something leaks, we know who did it.",
    visual: <ScreenshotVisual />,
  },
  {
    headline: "No number. No email. No name.",
    body: "Connect by QR code. Your identity is a key pair we generate on your device. We don't know who you are.",
    visual: <QrVisual />,
  },
];

export function Features() {
  return (
    <section id="features" className="bg-bg-primary px-6 py-28">
      <div className="mx-auto flex max-w-5xl flex-col gap-28">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.headline}
            className={`flex flex-col items-center gap-10 lg:gap-16 ${
              i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
            }`}
            initial={{ opacity: 0, y: 48 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-full lg:w-1/2">{feature.visual}</div>
            <div className="w-full lg:w-1/2">
              <h2 className="font-display text-3xl font-semibold tracking-display text-ink-primary sm:text-4xl">
                {feature.headline}
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-secondary">{feature.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
