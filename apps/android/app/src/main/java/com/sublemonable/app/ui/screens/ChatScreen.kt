// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.data.Message
import com.sublemonable.app.data.MessageState
import com.sublemonable.app.ui.components.ComposeBar
import com.sublemonable.app.ui.components.LemonAvatar
import com.sublemonable.app.ui.components.MessageBubble
import com.sublemonable.app.ui.components.SecurityBadge
import com.sublemonable.app.ui.components.SecurityState
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BackgroundSecondary
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TypeScale
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val DateDividerFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("dd MMM yyyy")

/**
 * Chat view (design_system.screens.chat_view): header with avatar, name and
 * the verify/burn-all actions; persistent encryption micro-badge; message
 * list with mono date dividers; compose bar with TTL + burn-on-read.
 *
 * This composable only ever exists inside an Activity that set FLAG_SECURE —
 * everything rendered here is hard-blocked from screenshots at the OS level.
 */
@Composable
fun ChatScreen(
    conversation: Conversation,
    messages: List<Message>,
    peerTyping: Boolean,
    defaultTtlSeconds: Int?,
    defaultBurnOnRead: Boolean,
    ttlOptions: List<Int?>,
    onBack: () -> Unit,
    onVerifyKeys: () -> Unit,
    onBurnAll: () -> Unit,
    onSend: (text: String, ttlSeconds: Int?, burnOnRead: Boolean) -> Unit,
    onMessagesSeen: (messageIds: List<String>) -> Unit,
    modifier: Modifier = Modifier,
    onTyping: (Boolean) -> Unit = {},
) {
    var draft by rememberSaveable { mutableStateOf("") }
    // Per-message overrides for the compose-bar burn controls. null = no
    // explicit choice, so the CURRENT settings default applies — live: a new
    // chat starts on the real default, and flipping the setting updates the
    // effective value even while this chat is composed. Deliberately plain
    // remember, NOT rememberSaveable: the old code seeded saveable state from
    // the default once, and a restored stale snapshot (process death, config
    // change) then shadowed the setting for good — the Settings toggles
    // looked completely dead.
    var burnOnReadOverride by remember { mutableStateOf<Boolean?>(null) }
    var ttlOverrideIndex by remember { mutableStateOf<Int?>(null) }
    val burnOnRead = burnOnReadOverride ?: defaultBurnOnRead
    val ttlIndex = ttlOverrideIndex ?: ttlOptions.indexOf(defaultTtlSeconds).coerceAtLeast(0)
    val ttlSeconds = ttlOptions.getOrNull(ttlIndex)

    // Opening the chat (or a new message arriving while it is open) marks
    // incoming messages as seen — the trigger for burn-on-read grace timers
    // and (when enabled) read receipts. Batched: one callback per change-set,
    // so a backlog of unread messages costs one receipt envelope, not N.
    LaunchedEffect(messages) {
        val seen = messages
            .filter { !it.isMine && (it.state == MessageState.DELIVERED || it.state == MessageState.SENT) }
            .map { it.id }
        if (seen.isNotEmpty()) onMessagesSeen(seen)
    }

    // Typing indicator out — sent as encrypted signals, not plaintext.
    LaunchedEffect(draft.isNotBlank()) {
        onTyping(draft.isNotBlank())
    }

    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary)
            .imePadding(),
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BackgroundSecondary)
                .padding(horizontal = 4.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Lemon,
                )
            }
            LemonAvatar(name = conversation.displayName, verified = conversation.verified)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 10.dp),
            ) {
                Text(
                    text = conversation.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                    maxLines = 1,
                )
                Text(
                    text = if (peerTyping) "typing…" else "Encrypted",
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Xs,
                    color = if (peerTyping) Lemon else TextMuted,
                )
            }
            // Verify keys — lemon slice icon (SecurityBadge handles states).
            SecurityBadge(
                state = when {
                    conversation.keyChanged -> SecurityState.WARNING
                    conversation.verified -> SecurityState.VERIFIED
                    else -> SecurityState.UNVERIFIED
                },
                onClick = onVerifyKeys,
            )
            // Burn all.
            IconButton(onClick = onBurnAll) {
                Icon(
                    imageVector = Icons.Filled.LocalFireDepartment,
                    contentDescription = "Burn every message in this chat",
                    tint = BurnOrange,
                )
            }
        }

        // Persistent encryption micro-badge.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "🔒 End-to-end encrypted",
                style = MaterialTheme.typography.labelMedium,
                color = Lemon.copy(alpha = 0.55f),
            )
        }

        // Message list with mono date dividers.
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 12.dp,
                vertical = 8.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            var lastDate: LocalDate? = null
            messages.forEach { message ->
                val messageDate = Instant.ofEpochMilli(message.timestampMs)
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate()
                if (messageDate != lastDate) {
                    lastDate = messageDate
                    item(key = "divider-$messageDate") {
                        DateDivider(date = messageDate)
                    }
                }
                item(key = message.id) {
                    MessageBubble(message = message)
                }
            }
        }

        ComposeBar(
            value = draft,
            onValueChange = { draft = it },
            onSend = {
                if (draft.isNotBlank()) {
                    onSend(draft.trim(), ttlSeconds, burnOnRead)
                    draft = ""
                }
            },
            burnOnRead = burnOnRead,
            onToggleBurnOnRead = { burnOnReadOverride = !burnOnRead },
            ttlSeconds = ttlSeconds,
            onCycleTtl = { ttlOverrideIndex = (ttlIndex + 1) % ttlOptions.size },
        )
    }
}

@Composable
private fun DateDivider(date: LocalDate) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Date dividers: centered, JetBrains Mono, muted (chat_view spec).
        Text(
            text = DateDividerFormatter.format(date),
            fontFamily = MonoFamily,
            fontSize = TypeScale.Xs,
            color = TextMuted,
        )
    }
}
