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
