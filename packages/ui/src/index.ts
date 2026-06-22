// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

export * from "./tokens.js";
export {
  LemonSlice,
  LemonSpinner,
  SEGMENT_COUNT,
  type LemonSliceProps,
  type LemonSliceVariant,
} from "./LemonSlice.js";
export { SublemonableStyles, sublemonableCss } from "./styles.js";
export { BurnParticles } from "./BurnParticles.js";
export { BurnTimer, type BurnTimerProps } from "./BurnTimer.js";
export { MessageBubble, type MessageBubbleProps } from "./MessageBubble.js";
export { ComposeBar, type ComposeBarProps } from "./ComposeBar.js";
export {
  ConversationList,
  type Conversation,
  type ConversationListProps,
} from "./ConversationList.js";
export { SecurityBadge, type SecurityBadgeProps, type SecurityState } from "./SecurityBadge.js";
export { CaptureWarningOverlay, type CaptureWarningOverlayProps } from "./CaptureWarningOverlay.js";
export {
  PassphraseSetup,
  passphraseStrength,
  type PassphraseSetupProps,
} from "./PassphraseSetup.js";
export { KeyFingerprintDisplay, type KeyFingerprintDisplayProps } from "./KeyFingerprintDisplay.js";

// Reconciled from lemon-ui.jsx brainstorm into the dark design system.
export { SendButton, type SendButtonProps } from "./SendButton.js";
export { TypingIndicator, type TypingIndicatorProps } from "./TypingIndicator.js";
export { LemonDrop, type LemonDropProps } from "./LemonDrop.js";

// v1.5 connection / privacy UI.
export {
  ConnectionModeBadge,
  type ConnectionModeBadgeProps,
  type ConnectionMode,
  type TransportState,
} from "./ConnectionModeBadge.js";
export { PlatformWarningBadge, type PlatformWarningBadgeProps } from "./PlatformWarningBadge.js";
export { ClearnetWarningBanner, type ClearnetWarningBannerProps } from "./ClearnetWarningBanner.js";
export { PrivacyView, type PrivacyViewProps, type RevealMode } from "./PrivacyView.js";
