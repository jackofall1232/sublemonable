// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import UserNotifications

/// Content-free notifications.
///
/// CRITICAL RULE: notification content is ALWAYS exactly "New message" —
/// never a preview, never a sender name, never a count that could correlate
/// to a conversation. This holds in three layers:
///   1. The server pushes no content (it has none — zero-knowledge).
///   2. The NotificationService extension rewrites whatever arrives down to
///      "New message" (see NotificationService/NotificationService.swift).
///   3. Local notifications built here use the same fixed strings.
public final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = NotificationManager()

    /// The only strings a Sublemonable notification may ever contain.
    public static let fixedTitle = "Sublemonable"
    public static let fixedBody = "New message"

    public func configure() {
        UNUserNotificationCenter.current().delegate = self
    }

    public func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Posts the content-free local notification used when a message arrives
    /// while the app is backgrounded but still connected.
    public func postNewMessageNotification() {
        let content = UNMutableNotificationContent()
        content.title = Self.fixedTitle
        content.body = Self.fixedBody
        content.sound = .default
        // Deliberately NOT set: subtitle, userInfo content, thread/sender
        // identifiers — nothing that could leak who or what.
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: UNUserNotificationCenterDelegate

    /// Foreground arrivals show nothing — the message is already on screen,
    /// and a banner over the chat would only duplicate (and linger).
    public func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        []
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       didReceive response: UNNotificationResponse) async {
        // Tapping opens the app at the chat list; deliberately no deep link
        // to a specific conversation (the notification doesn't know one).
    }
}
