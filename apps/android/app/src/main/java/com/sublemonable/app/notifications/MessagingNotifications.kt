// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.sublemonable.app.MainActivity
import com.sublemonable.app.R

/**
 * Content-free notifications.
 *
 * Critical rules enforced here:
 *  - The notification text is ALWAYS the literal "New message". Never a
 *    preview, never a sender name, never anything derived from a message.
 *  - VISIBILITY_SECRET on both the channel and every notification: nothing
 *    shows on the lock screen, not even the fact that a notification exists.
 */
object MessagingNotifications {

    private const val CHANNEL_ID = "messages"
    private const val NOTIFICATION_ID = 1001

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_description)
            // Nothing on the lock screen — ever.
            lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
            setShowBadge(true)
            enableLights(false)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Shows the one and only notification this app produces. A single fixed
     * id keeps multiple arrivals collapsed into one "New message" entry —
     * even the COUNT of pending messages is metadata we choose not to leak.
     */
    fun showNewMessage(context: Context) {
        if (!canPost(context)) return

        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_lemon)
            .setContentTitle(context.getString(R.string.app_name))
            // ALWAYS this string. No message content, no sender, no count.
            .setContentText(context.getString(R.string.notification_new_message))
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    fun cancelAll(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }

    private fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }
}
