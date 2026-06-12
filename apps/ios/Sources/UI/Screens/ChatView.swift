// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Chat screen per design_system.screens.chat_view:
/// - header: back, avatar + name/status, verify-key (lemon slice icon) and
///   burn-all (flame icon) actions
/// - persistent encryption micro-badge: "🔒 End-to-end encrypted"
/// - message list with mono, muted, centered date dividers
/// - ComposeBar with the lemon send button
public struct ChatView: View {
    public let conversation: Conversation
    @ObservedObject var messageStore: MessageStore
    public var onBack: () -> Void
    public var onVerifyKeys: () -> Void

    @State private var draft = ""
    @State private var burnOnRead = false
    @State private var ttlSeconds: Int?
    @State private var confirmBurnAll = false

    public init(conversation: Conversation,
                messageStore: MessageStore,
                onBack: @escaping () -> Void,
                onVerifyKeys: @escaping () -> Void) {
        self.conversation = conversation
        self.messageStore = messageStore
        self.onBack = onBack
        self.onVerifyKeys = onVerifyKeys
    }

    private var messages: [Message] {
        messageStore.messages(for: conversation.id)
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            EncryptionMicroBadge()
                .padding(.vertical, Spacing.s2)
            messageList
            ComposeBar(text: $draft,
                       burnOnRead: $burnOnRead,
                       ttlSeconds: $ttlSeconds,
                       onSend: sendDraft)
        }
        .background(Color.backgroundPrimary.ignoresSafeArea())
        .confirmationDialog("Burn every message in this chat?",
                            isPresented: $confirmBurnAll,
                            titleVisibility: .visible) {
            Button("Burn all", role: .destructive) {
                messageStore.burnAll(conversationID: conversation.id)
            }
        } message: {
            Text("Messages burn on both sides. There is no undo — that's the point.")
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Spacing.s3) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.lemon)
            }
            .accessibilityLabel("Back")

            LemonAvatar(name: conversation.contact.displayName,
                        verified: conversation.contact.verified,
                        size: 36)

            VStack(alignment: .leading, spacing: 1) {
                Text(conversation.contact.displayName)
                    .font(SubFont.body(TypeScale.base, weight: .medium))
                    .foregroundColor(.textPrimary)
                    .lineLimit(1)
                statusLine
            }

            Spacer()

            // Verify keys — the lemon slice icon.
            Button(action: onVerifyKeys) {
                LemonSliceView(variant: .securityIndicator(
                    segments: conversation.contact.verified ? 8 : 0))
                    .frame(width: 22, height: 22)
            }
            .accessibilityLabel("Verify keys")

            // Burn all — the flame icon.
            Button { confirmBurnAll = true } label: {
                Image(systemName: "flame.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.burnOrange)
            }
            .accessibilityLabel("Burn all messages")
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s2)
        .background(Color.backgroundSecondary)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.borderToken).frame(height: 1)
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        if conversation.contact.identityKeyChanged {
            Text("Key changed — verify identity")
                .font(SubFont.body(TypeScale.xs))
                .foregroundColor(.burnOrange)
        } else if conversation.contact.verified {
            Text("Keys verified")
                .font(SubFont.body(TypeScale.xs))
                .foregroundColor(.verifiedGreen)
        } else {
            Text("Tap the slice to verify keys")
                .font(SubFont.body(TypeScale.xs))
                .foregroundColor(.textMuted)
        }
    }

    // MARK: Message list

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: Spacing.s2) {
                    ForEach(groupedByDay, id: \.day) { group in
                        dateDivider(group.day)
                        ForEach(group.messages) { message in
                            MessageBubble(
                                message: message,
                                onOpen: {
                                    messageStore.markOpened(messageID: message.id,
                                                            conversationID: conversation.id)
                                },
                                onBurnFinished: {
                                    messageStore.burnAnimationFinished(
                                        messageID: message.id,
                                        conversationID: conversation.id)
                                }
                            )
                            .id(message.id)
                        }
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
            }
            .onChange(of: messages.count) { _ in
                if let last = messages.last {
                    withAnimation(Motion.easeDefault()) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private struct DayGroup {
        let day: Date
        let messages: [Message]
    }

    private var groupedByDay: [DayGroup] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: messages) {
            calendar.startOfDay(for: $0.sentAt)
        }
        return groups.keys.sorted().map { DayGroup(day: $0, messages: groups[$0] ?? []) }
    }

    private func dateDivider(_ day: Date) -> some View {
        Text(day.formatted(date: .abbreviated, time: .omitted))
            .font(SubFont.mono(TypeScale.xs))
            .foregroundColor(.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.s2)
    }

    // MARK: Sending

    private func sendDraft() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        let contact = conversation.contact
        let ttl = ttlSeconds
        let burn = burnOnRead
        Task {
            await messageStore.send(text: text, to: contact,
                                    ttlSeconds: ttl, burnOnRead: burn)
        }
    }
}
