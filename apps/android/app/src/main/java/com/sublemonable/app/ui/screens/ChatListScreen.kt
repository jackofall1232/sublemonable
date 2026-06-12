// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.sublemonable.app.data.Conversation
import com.sublemonable.app.ui.components.ConversationList
import com.sublemonable.app.ui.components.LemonSliceLogo
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.PillShape
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary

/**
 * Chat list (design_system.screens.chat_list): wordmark header with settings
 * action, lemon-bordered pill search, conversation list, and the lemon FAB
 * with its glow shadow. Root warning (security/RootDetection) appears as a
 * dismissible banner — warn, never block.
 */
@Composable
fun ChatListScreen(
    conversations: List<Conversation>,
    rootWarningVisible: Boolean,
    onDismissRootWarning: () -> Unit,
    onOpenConversation: (Conversation) -> Unit,
    onOpenSettings: () -> Unit,
    onNewChat: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    val filtered = if (query.isBlank()) {
        conversations
    } else {
        conversations.filter { it.displayName.contains(query, ignoreCase = true) }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header — wordmark left, settings right.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "SUBLEMONABLE",
                    style = MaterialTheme.typography.headlineMedium.copy(letterSpacing = 0.18.em),
                    color = Lemon,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onOpenSettings) {
                    Icon(
                        imageVector = Icons.Outlined.Settings,
                        contentDescription = "Settings",
                        tint = Lemon,
                    )
                }
            }

            if (rootWarningVisible) {
                RootWarningBanner(onDismiss = onDismissRootWarning)
            }

            // Lemon-bordered pill search bar.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .heightIn(min = 40.dp)
                    .background(BackgroundElevated, PillShape)
                    .border(1.dp, if (query.isBlank()) BorderColor else Lemon, PillShape)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null,
                    tint = TextSecondary,
                    modifier = Modifier.size(18.dp),
                )
                Box(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                    if (query.isEmpty()) {
                        Text(
                            text = "Search",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextMuted,
                        )
                    }
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = TextPrimary),
                        cursorBrush = SolidColor(Lemon),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (filtered.isEmpty()) {
                EmptyChatListState(modifier = Modifier.weight(1f))
            } else {
                ConversationList(
                    conversations = filtered,
                    onOpenConversation = onOpenConversation,
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 8.dp),
                )
            }
        }

        // Compose FAB — lemon circle, lemon-glow shadow, bottom right.
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp)
                .shadow(elevation = 12.dp, shape = CircleShape, ambientColor = Lemon, spotColor = Lemon)
                .size(56.dp)
                .background(Lemon, CircleShape)
                .clickable(onClick = onNewChat),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Add,
                contentDescription = "New encrypted chat",
                tint = TextOnLemon,
            )
        }
    }
}

@Composable
private fun EmptyChatListState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LemonSliceLogo(size = 72.dp, tint = TextMuted)
        Text(
            text = "Nothing here. That's the point.",
            style = MaterialTheme.typography.bodyLarge,
            color = TextSecondary,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            text = "Tap the lemon to start an encrypted chat.",
            style = MaterialTheme.typography.bodySmall,
            color = TextMuted,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun RootWarningBanner(onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .background(BackgroundElevated, MaterialTheme.shapes.medium)
            .border(1.dp, BurnOrange, MaterialTheme.shapes.medium)
            .padding(start = 12.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "This device looks rooted",
                style = MaterialTheme.typography.titleSmall,
                color = BurnOrange,
            )
            Text(
                text = "Root access can expose decrypted messages in memory. " +
                    "Sublemonable still works — but the device itself is the weak link.",
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
            )
        }
        IconButton(onClick = onDismiss) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "Dismiss warning",
                tint = TextSecondary,
            )
        }
    }
}
