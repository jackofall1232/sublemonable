// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app

import com.sublemonable.app.data.Message
import com.sublemonable.app.data.MessageRepository
import com.sublemonable.app.data.MessageState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Burn-on-read timing and read-state semantics. Virtual time throughout —
 * the 5s grace window and the 600ms particle window elapse instantly.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MessageRepositoryTest {

    private fun TestScope.repository() =
        MessageRepository(scope = backgroundScope, clock = { currentTime })

    private fun message(
        id: String,
        isMine: Boolean = false,
        burnOnRead: Boolean = false,
        ttlSeconds: Int? = null,
    ) = Message(
        id = id,
        conversationId = "c1",
        text = "hello",
        isMine = isMine,
        timestampMs = 0L,
        ttlSeconds = ttlSeconds,
        burnOnRead = burnOnRead,
    )

    @Test
    fun `burn-on-read stays readable for the grace window then burns and notifies the peer`() =
        runTest {
            val repo = repository()
            var burned: Message? = null
            repo.onMessageBurned = { burned = it }
            repo.addIncoming(message("m1", burnOnRead = true))

            // Burn-on-read read is NOT receipt-worthy: the burn is the signal.
            assertFalse(repo.markRead("m1"))
            runCurrent()

            // READ and still visible for the whole window.
            assertEquals(MessageState.READ, repo.conversationMessages("c1").single().state)
            advanceTimeBy(MessageRepository.BURN_ON_READ_DELAY_MS - 1)
            assertEquals(MessageState.READ, repo.conversationMessages("c1").single().state)
            assertNull(burned)

            // Window elapses: burn starts and the peer is notified NOW —
            // burn time ≈ read time + grace window on both devices.
            advanceTimeBy(2)
            assertEquals(MessageState.BURNING, repo.conversationMessages("c1").single().state)
            assertEquals("m1", burned?.id)

            // Particle dissolve ends: the message ceases to exist.
            advanceTimeBy(MessageRepository.BURN_ANIMATION_MS + 1)
            assertTrue(repo.conversationMessages("c1").isEmpty())
        }

    @Test
    fun `repeated marks during the grace window do not shorten or duplicate the burn`() = runTest {
        val repo = repository()
        val burnedIds = mutableListOf<String>()
        repo.onMessageBurned = { burnedIds.add(it.id) }
        repo.addIncoming(message("m1", burnOnRead = true))

        repo.markRead("m1")
        runCurrent()
        advanceTimeBy(MessageRepository.BURN_ON_READ_DELAY_MS / 2)
        repo.markRead("m1") // chat recomposed mid-window
        advanceTimeBy(MessageRepository.BURN_ON_READ_DELAY_MS) // well past the original deadline

        assertEquals(listOf("m1"), burnedIds)
    }

    @Test
    fun `manual burn during the grace window burns once not twice`() = runTest {
        val repo = repository()
        val burnedIds = mutableListOf<String>()
        repo.onMessageBurned = { burnedIds.add(it.id) }
        repo.addIncoming(message("m1", burnOnRead = true))

        repo.markRead("m1")
        runCurrent()
        repo.burnAll("c1") // user hits burn-all mid-window

        advanceTimeBy(
            MessageRepository.BURN_ON_READ_DELAY_MS + MessageRepository.BURN_ANIMATION_MS + 10,
        )
        assertEquals(listOf("m1"), burnedIds)
        assertTrue(repo.conversationMessages("c1").isEmpty())
    }

    @Test
    fun `markRead reports the receipt-worthy transition exactly once`() = runTest {
        val repo = repository()
        repo.addIncoming(message("m1"))

        assertTrue(repo.markRead("m1"))
        assertFalse(repo.markRead("m1")) // repeat
        assertFalse(repo.markRead("missing"))
        assertEquals(MessageState.READ, repo.conversationMessages("c1").single().state)
    }

    @Test
    fun `own messages are never marked read locally`() = runTest {
        val repo = repository()
        repo.addOutgoing(message("m1", isMine = true))

        assertFalse(repo.markRead("m1"))
        assertEquals(MessageState.SENDING, repo.conversationMessages("c1").single().state)
    }

    @Test
    fun `peer read receipt flips an outgoing message to READ and ignores incoming ones`() =
        runTest {
            val repo = repository()
            repo.addOutgoing(message("mine", isMine = true))
            repo.markDelivered("mine")
            repo.addIncoming(message("theirs"))

            repo.onPeerRead("mine")
            repo.onPeerRead("theirs") // a peer cannot mark THEIR message read on our side
            repo.onPeerRead("missing")

            val byId = repo.conversationMessages("c1").associateBy { it.id }
            assertEquals(MessageState.READ, byId.getValue("mine").state)
            assertEquals(MessageState.DELIVERED, byId.getValue("theirs").state)
        }

    @Test
    fun `ttl burn still fires locally without notifying the peer`() = runTest {
        val repo = repository()
        val burnedIds = mutableListOf<String>()
        repo.onMessageBurned = { burnedIds.add(it.id) }
        repo.addIncoming(message("m1", ttlSeconds = 30))
        runCurrent()

        advanceTimeBy(30_000L + 1)
        assertEquals(MessageState.BURNING, repo.conversationMessages("c1").single().state)
        // TTL is enforced on both sides independently — no burn signal out.
        assertTrue(burnedIds.isEmpty())
    }
}
