// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Privacy view — a shoulder-surfing defense. Message content is covered by a
 * frosted lemon-citrus overlay and revealed only while you actively interact.
 * The bubble shapes stay visible; only the text is obscured, so it reads as a
 * deliberate design choice, not broken UI.
 *
 * Three reveal modes:
 *  - hold_to_reveal: revealed only while held (most secure).
 *  - tap_timed: tap reveals for a configurable duration, then re-blurs.
 *  - tap_toggle: tap toggles revealed/blurred.
 *
 * On a browser screenshot, whatever is on screen is captured — so if privacy
 * view is active and content is blurred, the screenshot captures the blur. That
 * is the best mitigation available on the web.
 *
 * Requires the `sub-privacy-frost` / `sub-privacy-revealed` rules from
 * <SublemonableStyles />.
 */

import { useEffect, useRef, useState } from "react";
import { LemonSlice } from "./LemonSlice.js";
import { color, typography } from "./tokens.js";

export type RevealMode = "hold_to_reveal" | "tap_timed" | "tap_toggle";

export interface PrivacyViewProps {
  /** Whether privacy view is active for this content. When false, children render plainly. */
  active: boolean;
  revealMode: RevealMode;
  /** Auto-re-blur duration for tap_timed, in seconds. */
  tapTimedSeconds?: number;
  children: React.ReactNode;
  /** Fired the first time the content is revealed — lets the parent mark the
   *  message opened (and trigger burn-on-read), which it otherwise can't see
   *  because reveal state is managed inside this component. */
  onReveal?: () => void;
}

export function PrivacyView({
  active,
  revealMode,
  tapTimedSeconds = 10,
  children,
  onReveal,
}: PrivacyViewProps) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);
  // Re-blur whenever privacy view is toggled off-then-on, or content changes.
  useEffect(() => {
    if (!active) setRevealed(false);
  }, [active]);

  if (!active) return <>{children}</>;

  const hold = revealMode === "hold_to_reveal";

  // Revealing — by any mode — counts as opening the message; notify the parent.
  const reveal = () => {
    setRevealed(true);
    onReveal?.();
  };

  const onHoldStart = () => hold && reveal();
  const onHoldEnd = () => hold && setRevealed(false);

  const onTap = () => {
    if (hold) return;
    if (revealMode === "tap_toggle") {
      setRevealed((r) => {
        if (!r) onReveal?.();
        return !r;
      });
      return;
    }
    // tap_timed: reveal, then auto re-blur.
    reveal();
    clearTimer();
    timer.current = setTimeout(() => setRevealed(false), Math.max(1, tapTimedSeconds) * 1000);
  };

  const hint =
    revealMode === "hold_to_reveal"
      ? "Hold to reveal"
      : revealMode === "tap_timed"
        ? "Tap to reveal"
        : "Tap to reveal";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={revealed ? "Message revealed" : `Hidden — ${hint}`}
      onMouseDown={onHoldStart}
      onMouseUp={onHoldEnd}
      onMouseLeave={onHoldEnd}
      onTouchStart={(e) => {
        if (hold) {
          e.preventDefault();
          onHoldStart();
        }
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        hold ? onHoldEnd() : onTap();
      }}
      onClick={onTap}
      style={{ position: "relative", cursor: "pointer", borderRadius: 12, overflow: "hidden" }}
    >
      {children}
      {/* The frosted lemon overlay sits above the content, fading out on reveal. */}
      <div
        aria-hidden
        className={revealed ? "sub-privacy-revealed" : "sub-privacy-frost"}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          pointerEvents: revealed ? "none" : "auto",
          opacity: revealed ? 0 : 1,
        }}
      >
        {!revealed && (
          <>
            <LemonSlice
              variant="logo_mark"
              size={16}
              fillColor={color.core.lemonDeep}
              label="Hidden"
            />
            <span
              style={{
                fontFamily: typography.body.family,
                fontSize: typography.scale.xs,
                color: color.semantic.textSecondary,
              }}
            >
              {hint}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
