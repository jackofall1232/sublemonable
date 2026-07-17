// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sublemonable.app.data.Message
import com.sublemonable.app.data.MessageState
import com.sublemonable.app.ui.theme.BorderColor
import com.sublemonable.app.ui.theme.BubbleReceivedShape
import com.sublemonable.app.ui.theme.BubbleSentShape
import com.sublemonable.app.ui.theme.BackgroundMessageReceived
import com.sublemonable.app.ui.theme.BackgroundMessageSent
import com.sublemonable.app.ui.theme.BurnOrange
import com.sublemonable.app.ui.theme.MonoFamily
import com.sublemonable.app.ui.theme.TextMuted
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TypeScale
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val TimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

/**
 * Message bubble per design_system.components.message_bubble:
 *  - sent:     lemon #F5E642 background, dark text, radius 18/18/4/18
 *  - received: #242100 background, light text, 1px #2E2B00 border,
 *              radius 18/18/18/4
 *  - both:     padding 10x14, 0.9375rem text, max width 72%
 *
 * When the message enters [MessageState.BURNING], the bubble chars and
 * shrinks while flame particles dissolve upward (600ms) — actual removal is
 * handled by MessageRepository once the animation window elapses.
 */
@Composable
fun MessageBubble(
    message: Message,
    modifier: Modifier = Modifier,
) {
    val isMine = message.isMine
    val burning = message.state == MessageState.BURNING
    val progress = rememberBurnProgress(burning)

    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val bubbleMaxWidth = maxWidth * 0.72f

        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = if (isMine) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box {
                Box(
                    modifier = Modifier
                        .widthIn(max = bubbleMaxWidth)
                        .graphicsLayer {
                            // Char-and-shrink under the particle field — the
                            // particles carry the effect; this is the collapse.
                            val collapse = 1f - progress
                            scaleX = collapse
                            scaleY = collapse
                            alpha = 1f - progress * 0.85f
                            transformOrigin = androidx.compose.ui.graphics.TransformOrigin(
                                0.5f,
                                1f,
                            )
                        }
                        .then(
                            if (isMine) {
                                Modifier.background(BackgroundMessageSent, BubbleSentShape)
                            } else {
                                Modifier
                                    .background(BackgroundMessageReceived, BubbleReceivedShape)
                                    .border(1.dp, BorderColor, BubbleReceivedShape)
                            },
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Column {
                        Text(
                            text = message.text,
                            style = MaterialTheme.typography.bodyMedium,
                            fontSize = TypeScale.Message,
                            color = if (isMine) TextOnLemon else TextPrimary,
                        )
                        Row(
                            modifier = Modifier
                                .align(Alignment.End)
                                .padding(top = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            // Timestamps render in JetBrains Mono (critical rule).
                            Text(
                                text = TimeFormatter.format(Instant.ofEpochMilli(message.timestampMs)),
                                fontFamily = MonoFamily,
                                fontSize = TypeScale.Xs,
                                color = if (isMine) {
                                    TextOnLemon.copy(alpha = 0.6f)
                                } else {
                                    TextMuted
                                },
                                textAlign = TextAlign.End,
                            )
                            // Timed message: mini lemon-slice countdown.
                            val deliveredAt = message.deliveredAtMs
                            if (message.ttlSeconds != null && deliveredAt != null) {
                                BurnTimer(
                                    deliveredAtMs = deliveredAt,
                                    ttlSeconds = message.ttlSeconds,
                                    size = 14.dp,
                                )
                            }
                            // Burn-on-read: small flame on the bubble corner.
                            if (message.burnOnRead) {
                                Icon(
                                    imageVector = Icons.Filled.LocalFireDepartment,
                                    contentDescription = "Burns after reading",
                                    tint = BurnOrange,
                                    modifier = Modifier.size(13.dp),
                                )
                            }
                            // Outgoing status: "…" sending, "✓" handed to the
                            // relay (the protocol has no per-device delivered
                            // event), "✓✓" only when the peer's encrypted read
                            // receipt arrives — so the double mark is a real
                            // read confirmation, never an approximation.
                            if (isMine) {
                                Text(
                                    text = when (message.state) {
                                        MessageState.SENDING -> "…"
                                        MessageState.READ -> "✓✓"
                                        else -> "✓"
                                    },
                                    fontFamily = MonoFamily,
                                    fontSize = TypeScale.Xs,
                                    color = if (message.state == MessageState.READ) {
                                        TextOnLemon
                                    } else {
                                        TextOnLemon.copy(alpha = 0.45f)
                                    },
                                )
                            }
                        }
                    }
                }

                // Flame particles rise OVER the collapsing bubble.
                if (burning) {
                    BurnParticles(
                        progress = progress,
                        seed = message.id.hashCode(),
                        modifier = Modifier.matchParentSize(),
                    )
                }
            }
        }
    }
}
