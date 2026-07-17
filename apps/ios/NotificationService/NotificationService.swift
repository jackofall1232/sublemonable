// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import UserNotifications

/// Notification Service Extension whose ONLY job is to guarantee that no
/// notification ever shows message content or a sender name.
///
/// The Sublemonable server is zero-knowledge — it has no content to push in
/// the first place. This extension is defense-in-depth: whatever arrives in
/// the push payload (now or after any future server change, or from a
/// malicious/compromised server), the user-visible notification is rewritten
/// to the fixed strings "Sublemonable" / "New message" and every other field
/// is stripped.
final class NotificationService: UNNotificationServiceExtension {
    private static let fixedTitle = "Sublemonable"
    private static let fixedBody = "New message"
    // The extension resolves sounds against ITS OWN bundle, so it uses the
    // bundled brand default (new_message.wav ships in this target too). A
    // user's imported custom sound lives in the app container and is NOT
    // reachable from here — to honor it on push, put the custom file in a
    // shared App Group container and read NotificationSoundStore.preferenceKey
    // from UserDefaults(suiteName:). Push isn't wired yet, so this is the
    // documented upgrade path, not a current gap.
    private static let soundName = UNNotificationSoundName("new_message.wav")

    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var sanitizedContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler

        // Build clean content from scratch rather than mutating the incoming
        // payload — nothing from the wire can survive into the banner.
        let content = UNMutableNotificationContent()
        content.title = Self.fixedTitle
        content.body = Self.fixedBody
        content.sound = UNNotificationSound(named: Self.soundName)
        // Explicitly NOT carried over: subtitle, userInfo, attachments,
        // threadIdentifier, summaryArgument, badge — any of these could leak
        // sender identity or content.

        sanitizedContent = content
        contentHandler(content)
    }

    /// If the system runs out of time, it shows whatever we hand it here.
    /// Hand it the sanitized content — never the original request payload.
    override func serviceExtensionTimeWillExpire() {
        guard let contentHandler else { return }
        let fallback = sanitizedContent ?? {
            let content = UNMutableNotificationContent()
            content.title = Self.fixedTitle
            content.body = Self.fixedBody
            return content
        }()
        contentHandler(fallback)
    }
}
