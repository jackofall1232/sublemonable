// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI

/// Safety Number verification (contact_verification in the master spec):
/// SHA-512 fingerprint of both identity keys, rendered as groups of 4 hex in
/// JetBrains Mono, plus a QR code for in-person scanning. In-person
/// verification is recommended for high-security contacts.
public struct KeyVerificationView: View {
    public let contact: Contact
    public let safetyNumber: String
    public var onMarkVerified: () -> Void
    public var onDismiss: () -> Void

    @State private var verifiedPulse = false

    public init(contact: Contact,
                safetyNumber: String,
                onMarkVerified: @escaping () -> Void,
                onDismiss: @escaping () -> Void) {
        self.contact = contact
        self.safetyNumber = safetyNumber
        self.onMarkVerified = onMarkVerified
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()

            ScrollView {
                VStack(spacing: Spacing.s6) {
                    header

                    if contact.identityKeyChanged {
                        keyChangedWarning
                    }

                    ZStack {
                        LemonSliceView(variant: .securityIndicator(
                            segments: contact.verified ? 8 : 0))
                            .frame(width: 88, height: 88)
                            .hueRotation(.degrees(contact.verified ? 75 : 0))
                            .scaleEffect(verifiedPulse ? 1.12 : 1.0)
                        if contact.verified {
                            Image(systemName: "checkmark")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.textOnLemon)
                        }
                    }

                    Text("Safety number with \(contact.displayName)")
                        .font(SubFont.display(TypeScale.xl, weight: .semibold))
                        .foregroundColor(.textPrimary)
                        .multilineTextAlignment(.center)

                    Text("Compare these numbers in person or over a call you trust. If they match, your conversation cannot be intercepted.")
                        .font(SubFont.body(TypeScale.sm))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Spacing.s6)

                    // Groups of 4 hex, JetBrains Mono — always.
                    KeyFingerprintView(fingerprint: safetyNumber)

                    FingerprintQRCode(payload: safetyNumber)

                    if !contact.verified {
                        Button {
                            withAnimation(Motion.easeBounce(0.4)) { verifiedPulse = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                                verifiedPulse = false
                                onMarkVerified()
                            }
                        } label: {
                            Text("Mark as verified")
                                .font(SubFont.body(TypeScale.base, weight: .medium))
                                .foregroundColor(.textOnLemon)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.s4)
                                .background(Capsule().fill(Color.lemon))
                        }
                        .buttonStyle(LemonSpringButtonStyle())
                        .padding(.horizontal, Spacing.s6)
                    } else {
                        SecurityBadge(status: .verified)
                    }
                }
                .padding(.vertical, Spacing.s6)
            }
        }
    }

    private var header: some View {
        HStack {
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.textSecondary)
            }
            .accessibilityLabel("Close")
            Spacer()
        }
        .padding(.horizontal, Spacing.s4)
    }

    private var keyChangedWarning: some View {
        HStack(spacing: Spacing.s3) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.burnOrange)
            Text("\(contact.displayName)'s key changed. This happens after a reinstall — or an interception attempt. Re-verify before trusting this chat.")
                .font(SubFont.body(TypeScale.sm))
                .foregroundColor(.textPrimary)
        }
        .padding(Spacing.s4)
        .background(RoundedRectangle(cornerRadius: Radius.md).fill(Color.backgroundElevated))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .strokeBorder(Color.burnOrange.opacity(0.6), lineWidth: 1)
        )
        .padding(.horizontal, Spacing.s4)
    }
}
