// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/** Keyframes and base rules the components rely on. Render once near the app root. */
export const sublemonableCss = `
@keyframes sub-burn-particle {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--sub-drift, 0px), -64px) scale(0.2); opacity: 0; }
}
@keyframes sub-burn-shrink {
  0%   { transform: scale(1); opacity: 1; filter: brightness(1); }
  35%  { filter: brightness(1.4) saturate(1.4); }
  100% { transform: scale(0); opacity: 0; filter: brightness(2); }
}
@keyframes sub-glow-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(245, 230, 66, 0.3); }
  50%      { box-shadow: 0 0 28px rgba(245, 230, 66, 0.55); }
}
@keyframes sub-ring-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6); }
  100% { box-shadow: 0 0 0 16px rgba(74, 222, 128, 0); }
}
/* Typing indicator: lemon drops bounce in sequence. Reconciled from the
   lemon-ui brainstorm into the dark design system. */
@keyframes sub-drop-bounce {
  0%, 80%, 100% { transform: translateY(0) scaleY(1); }
  40%           { transform: translateY(-7px) scaleY(0.85); }
}

/* Privacy view: a frosted lemon-citrus overlay over message content — a
   deliberate, on-brand look rather than a broken-UI grey blur. Bubble shapes
   stay visible; only the text is obscured. */
.sub-privacy-frost {
  backdrop-filter: blur(20px) saturate(1.1);
  -webkit-backdrop-filter: blur(20px) saturate(1.1);
  background: rgba(245, 230, 66, 0.08);
  transition: backdrop-filter 200ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sub-privacy-revealed {
  backdrop-filter: blur(0) saturate(1);
  -webkit-backdrop-filter: blur(0) saturate(1);
  background: transparent;
  transition: backdrop-filter 150ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Screenshot protection: applied to the message container on focus loss.
   120ms max — it must feel jarring and protective. */
.sub-capture-blur {
  filter: blur(24px) grayscale(1) !important;
  transition: filter 120ms cubic-bezier(0.4, 0, 1, 1) !important;
}

/* Message content can't be selected or right-clicked into the clipboard. */
.sub-message-content {
  user-select: none;
  -webkit-user-select: none;
}
`;

/** Injects the shared keyframes/rules. Render exactly once, near the app root. */
export function SublemonableStyles() {
  return <style dangerouslySetInnerHTML={{ __html: sublemonableCss }} />;
}
