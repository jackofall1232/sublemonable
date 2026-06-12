// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.LemonZest
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.PillShape
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TypeScale
import com.sublemonable.app.ui.theme.VerifiedGreen
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val ListTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

/**
 * Conversation list (design_system.components.conversation_list_item).
 * Privacy rule baked in: the preview line is ALWAYS the literal text
 * "Encrypted message" — message content never appears outside an open chat.
 */
@Composable
fun ConversationList(
    conversations: List<Conversation>,
    onOpenConversation: (Conversation) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(modifier = modifier.fillMaxSize()) {
        items(conversations, key = { it.id }) { conversation ->
            ConversationListItem(
                conversation = conversation,
                onClick = { onOpenConversation(conversation) },
            )
        }
    }
}

@Composable
fun ConversationListItem(
    conversation: Conversation,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LemonAvatar(
            name = conversation.displayName,
            verified = conversation.verified,
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = conversation.displayName,
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
                maxLines = 1,
            )
            // ALWAYS "Encrypted message" — never a content preview.
            Text(
                text = "Encrypted message",
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
                maxLines = 1,
            )
        }

        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (conversation.lastActivityMs > 0L) {
                Text(
                    text = ListTimeFormatter.format(Instant.ofEpochMilli(conversation.lastActivityMs)),
                    fontFamily = MonoFamily,
                    fontSize = TypeScale.Xs,
                    color = TextMuted,
                )
            }
            if (conversation.unreadCount > 0) {
                Box(
                    modifier = Modifier
                        .background(Lemon, PillShape)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = conversation.unreadCount.toString(),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium,
                        color = TextOnLemon,
                    )
                }
            }
        }
    }
}

/** 44dp circular avatar on a lemon gradient; verified ring in green. */
@Composable
fun LemonAvatar(
    name: String,
    verified: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .then(
                if (verified) {
                    Modifier.border(2.dp, VerifiedGreen, CircleShape)
                } else {
                    Modifier
                },
            )
            .padding(if (verified) 3.dp else 0.dp)
            .background(
                brush = Brush.linearGradient(listOf(Lemon, LemonZest)),
                shape = CircleShape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.firstOrNull()?.uppercase() ?: "?",
            style = MaterialTheme.typography.titleMedium,
            color = TextOnLemon,
        )
    }
}
