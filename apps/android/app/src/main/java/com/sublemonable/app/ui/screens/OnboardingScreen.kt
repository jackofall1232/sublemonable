// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sublemonable.app.ui.components.BurnParticles
import com.sublemonable.app.ui.components.LemonSlice
import com.sublemonable.app.ui.components.QrCode
import com.sublemonable.app.ui.theme.BackgroundElevated
import com.sublemonable.app.ui.theme.BackgroundPrimary
import com.sublemonable.app.ui.theme.BubbleReceivedShape
import com.sublemonable.app.ui.theme.BubbleSentShape
import com.sublemonable.app.ui.theme.Lemon
import com.sublemonable.app.ui.theme.PillShape
import com.sublemonable.app.ui.theme.Rind
import com.sublemonable.app.ui.theme.TextOnLemon
import com.sublemonable.app.ui.theme.TextPrimary
import com.sublemonable.app.ui.theme.TextSecondary
import kotlinx.coroutines.launch

private data class OnboardingSlide(
    val headline: String,
    val body: String,
)

// design_system.screens.onboarding.slides — copy verbatim.
private val Slides = listOf(
    OnboardingSlide(
        headline = "End-to-end encrypted",
        body = "Your messages are locked before they leave your device. We can't read them. Nobody can.",
    ),
    OnboardingSlide(
        headline = "Messages that disappear",
        body = "Set any message to self-destruct. Once read, once seen, then gone.",
    ),
    OnboardingSlide(
        headline = "Screenshots? Blocked.",
        body = "On Android, screenshots are impossible. On iOS and browser, we blur instantly.",
    ),
    OnboardingSlide(
        headline = "No phone number needed",
        body = "Add contacts by QR code or link. We don't need your number, your email, or your name.",
    ),
)

/** Full-screen card stack, swipe through (design_system.screens.onboarding). */
@Composable
fun OnboardingScreen(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pagerState = rememberPagerState(pageCount = { Slides.size })
    val scope = rememberCoroutineScope()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundPrimary),
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.weight(1f),
        ) { page ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier.size(200.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    when (page) {
                        0 -> EncryptionLayersVisual()
                        1 -> BurningBubbleVisual()
                        2 -> BlockedScreenshotVisual()
                        else -> QrCode(content = "sublemonable://contact", size = 180.dp)
                    }
                }
                Text(
                    text = Slides[page].headline,
                    style = MaterialTheme.typography.displaySmall,
                    color = TextPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 40.dp),
                )
                Text(
                    text = Slides[page].body,
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }

        // Page indicator dots — lemon owns the active state.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            repeat(Slides.size) { index ->
                val active = pagerState.currentPage == index
                Box(
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .height(8.dp)
                        .width(if (active) 24.dp else 8.dp)
                        .background(if (active) Lemon else Rind, PillShape),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onDone) {
                Text("Skip", color = TextSecondary)
            }
            Button(
                onClick = {
                    if (pagerState.currentPage == Slides.lastIndex) {
                        onDone()
                    } else {
                        scope.launch {
                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Lemon,
                    contentColor = TextOnLemon,
                ),
            ) {
                Text(if (pagerState.currentPage == Slides.lastIndex) "Get started" else "Next")
            }
        }
    }
}

/** Slide 1 — animated lemon slice, segments as encryption layers. */
@Composable
private fun EncryptionLayersVisual() {
    val transition = rememberInfiniteTransition(label = "encryptionLayers")
    val fill by transition.animateFloat(
        initialValue = 0f,
        targetValue = 9f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "layersFill",
    )
    LemonSlice(size = 160.dp, filledSegments = fill.toInt().coerceAtMost(8))
}

/** Slide 2 — message bubble looping the upward particle burn. */
@Composable
private fun BurningBubbleVisual() {
    val transition = rememberInfiniteTransition(label = "burnLoop")
    val raw by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1.5f, // pause at the end of each loop
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "burnLoopProgress",
    )
    val progress = raw.coerceAtMost(1f)
    Box(contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .graphicsLayer {
                    val collapse = 1f - progress
                    scaleX = collapse
                    scaleY = collapse
                    alpha = 1f - progress * 0.85f
                }
                .background(Lemon, BubbleSentShape)
                .padding(horizontal = 18.dp, vertical = 12.dp),
        ) {
            Text(
                text = "Read it. It's gone.",
                style = MaterialTheme.typography.bodyMedium,
                color = TextOnLemon,
            )
        }
        BurnParticles(
            progress = progress,
            seed = 7,
            modifier = Modifier.size(180.dp, 80.dp),
        )
    }
}

/** Slide 3 — blurred mockup with a "blocked" pill. */
@Composable
private fun BlockedScreenshotVisual() {
    Box(contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.blur(12.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .background(Lemon, BubbleSentShape)
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            ) { Text("Secret plans", color = TextOnLemon) }
            Box(
                Modifier
                    .background(BackgroundElevated, BubbleReceivedShape)
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            ) { Text("Say less", color = TextPrimary) }
        }
        Box(
            modifier = Modifier
                .background(BackgroundPrimary.copy(alpha = 0.85f), PillShape)
                .padding(horizontal = 14.dp, vertical = 6.dp),
        ) {
            Text(
                text = "Screenshot blocked",
                style = MaterialTheme.typography.labelMedium,
                color = Lemon,
            )
        }
    }
}
