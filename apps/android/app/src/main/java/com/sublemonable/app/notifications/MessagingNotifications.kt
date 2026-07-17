// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
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

    // A channel's sound is immutable once created: changing setSound() on an
    // existing channel is silently ignored until the app is reinstalled. To
    // roll out a new sound we must publish a NEW channel id and delete the old
    // one. Bump this suffix (v2 -> v3 -> ...) any time the sound changes.
    private const val CHANNEL_ID = "messages_v2"
    private val LEGACY_CHANNEL_IDS = listOf("messages")
    private const val NOTIFICATION_ID = 1001

    /** URI of the bundled custom sound in res/raw/new_message.(wav|ogg). */
    private fun soundUri(context: Context): Uri =
        Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.new_message}",
        )

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Remove any pre-custom-sound channels so users aren't left on the old
        // default tone. Safe to call repeatedly; unknown ids are ignored.
        LEGACY_CHANNEL_IDS.forEach { manager.deleteNotificationChannel(it) }

        // USAGE_NOTIFICATION_COMMUNICATION_INSTANT marks this as a messaging
        // alert so the system routes/ducks it appropriately; SONIFICATION is
        // the correct content type for a short UI tone (not music/speech).
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

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
            // Custom notification tone bundled in res/raw. The user can still
            // override or silence it in system channel settings.
            setSound(soundUri(context), audioAttributes)
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

    /**
     * Opens the system's per-channel notification settings for the messages
     * channel, where the user can pick ANY sound (a system ringtone or their
     * own audio file) or silence it entirely.
     *
     * This is deliberately the override mechanism on Android rather than an
     * in-app file picker: the OS picker is richer, respects scoped storage,
     * and — importantly — a user's choice here is NOT overwritten when we call
     * [ensureChannel] again on next launch (Android ignores sound changes on an
     * already-created channel). Their choice only resets if we bump CHANNEL_ID
     * to ship a new *default*, which is a deliberate, rare event.
     *
     * Returns false if no activity could handle the intent (never throws).
     */
    fun openSoundSettings(context: Context): Boolean {
        val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ID)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: android.content.ActivityNotFoundException) {
            // Fall back to the app's notification settings if the specific
            // channel screen isn't available on this OEM/OS build.
            try {
                context.startActivity(
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                )
                true
            } catch (e2: android.content.ActivityNotFoundException) {
                false
            }
        }
    }

    private fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }
}
