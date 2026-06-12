// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import { motion } from "framer-motion";
import { LemonSlice } from "@/components/LemonSlice";

const BRAND_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function VisualFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-72 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-bg-secondary shadow-card">
      {children}
    </div>
  );
}

/** Two lemon slices passing an encrypted segment between them. */
export function KeyExchangeVisual() {
  return (
    <VisualFrame>
      <div className="flex w-full items-center justify-between px-10 sm:px-16">
        <LemonSlice size={72} label="" />
        <div className="relative mx-6 h-px flex-1 border-t border-dashed border-rind-soft">
          <motion.div
            className="absolute -top-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-lemon shadow-lemon-sm"
            animate={{ left: ["0%", "92%", "0%"] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <rect x="2.5" y="5" width="7" height="5" rx="1" fill="#0D0C00" />
              <path
                d="M 4 5 V 3.5 A 2 2 0 0 1 8 3.5 V 5"
                fill="none"
                stroke="#0D0C00"
                strokeWidth="1.4"
              />
            </svg>
          </motion.div>
        </div>
        <LemonSlice size={72} label="" />
      </div>
      <p className="absolute bottom-5 font-mono text-xs text-ink-muted">
        x3dh handshake · new key per message
      </p>
    </VisualFrame>
  );
}

/** Message bubble burn loop — particles rise, bubble shrinks to nothing. */
export function BurnVisual() {
  const particles = [-44, -26, -8, 10, 28, 46];
  return (
    <VisualFrame>
      <div className="relative">
        <motion.div
          className="rounded-bubble-sent bg-lemon px-5 py-3 text-sm font-medium text-ink-onlemon"
          animate={{
            opacity: [0, 1, 1, 1, 0],
            scale: [0.85, 1, 1, 1, 0.25],
            y: [8, 0, 0, 0, -14],
          }}
          transition={{
            duration: 5,
            times: [0, 0.1, 0.55, 0.75, 0.95],
            ease: "easeInOut",
            repeat: Infinity,
          }}
        >
          Read it. It&apos;s gone.
        </motion.div>
        {particles.map((x, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: i % 2 === 0 ? "#FF8C00" : "#F5E642" }}
            animate={{
              opacity: [0, 0, 1, 0],
              x: [x, x, x + (i % 2 === 0 ? -8 : 10)],
              y: [0, 0, -64 - (i % 3) * 14],
            }}
            transition={{
              duration: 5,
              times: [0, 0.72, 0.82, 1],
              ease: [0.4, 0, 1, 1],
              repeat: Infinity,
            }}
          />
        ))}
      </div>
      <p className="absolute bottom-5 font-mono text-xs text-ink-muted">burn-on-read · 600ms</p>
    </VisualFrame>
  );
}

function PhoneShell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-44 w-24 flex-col gap-2 overflow-hidden rounded-lg border border-rind-soft bg-bg-primary p-2.5">
        {children}
      </div>
      <span className="font-mono text-[10px] text-ink-muted">{label}</span>
    </div>
  );
}

/** Split mockup: blurred messages on one phone, hard block on the other. */
export function ScreenshotVisual() {
  const rows = [
    { w: "70%", self: false },
    { w: "55%", self: true },
    { w: "80%", self: false },
    { w: "45%", self: true },
    { w: "65%", self: false },
  ];
  return (
    <VisualFrame>
      <div className="flex items-center gap-8 sm:gap-14">
        <PhoneShell label="ios / browser — blurred">
          <div className="flex flex-1 flex-col justify-end gap-2 blur-[5px] saturate-0">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`h-3.5 rounded-md ${r.self ? "self-end bg-lemon" : "self-start bg-bg-elevated"}`}
                style={{ width: r.w }}
              />
            ))}
          </div>
        </PhoneShell>
        <PhoneShell label="android — blocked">
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <LemonSlice size={28} label="" segments={0} />
            <span className="text-center font-mono text-[9px] leading-tight text-ink-secondary">
              Screenshot
              <br />
              blocked
            </span>
          </div>
        </PhoneShell>
      </div>
    </VisualFrame>
  );
}

/** QR code scan with lemon-slice overlay and sweeping scan line. */
export function QrVisual() {
  // Deterministic QR-ish pattern.
  const cells: boolean[] = Array.from({ length: 100 }, (_, i) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x) > 0.5;
  });
  return (
    <VisualFrame>
      <div className="relative h-40 w-40 overflow-hidden rounded-md border border-rind-soft bg-bg-primary p-2">
        <div className="grid h-full w-full grid-cols-10 gap-px opacity-80">
          {cells.map((on, i) => (
            <div key={i} className={on ? "bg-pulp/70" : "bg-transparent"} />
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/40">
          <LemonSlice size={56} label="" />
        </div>
        <motion.div
          aria-hidden
          className="absolute inset-x-1 top-2 h-0.5 rounded-pill bg-lemon shadow-lemon-sm"
          animate={{ y: [0, 140, 0] }}
          transition={{ duration: 3.2, ease: BRAND_EASE, repeat: Infinity }}
        />
      </div>
      <p className="absolute bottom-5 font-mono text-xs text-ink-muted">
        scan to connect · no phone number
      </p>
    </VisualFrame>
  );
}
