// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI
import UIKit

/// Settings → Connection diagnostics. Plain, monospace, selectable log of
/// boot/connection stage markers — the iOS port of Android's Diagnostics
/// screen. Content is privacy-safe by construction (see BootDiagnostics):
/// fixed stage strings and error types/codes only, so "Copy" output is safe
/// to paste into a bug report verbatim.
public struct DiagnosticsView: View {
    @ObservedObject var diagnostics: BootDiagnostics

    public init(diagnostics: BootDiagnostics) {
        self.diagnostics = diagnostics
    }

    public var body: some View {
        Group {
            if diagnostics.entries.isEmpty {
                VStack(spacing: Spacing.s4) {
                    Image(systemName: "waveform.path.ecg")
                        .font(.system(size: 28))
                        .foregroundColor(.textMuted)
                    Text("Nothing recorded yet")
                        .font(SubFont.body(TypeScale.base, weight: .medium))
                        .foregroundColor(.textPrimary)
                    Text("Connection attempts log their stages here.\nLock and unlock the app to retry a connection.")
                        .font(SubFont.body(TypeScale.sm))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    SelectionContainer {
                        Text(diagnostics.entries.joined(separator: "\n"))
                            .font(SubFont.mono(TypeScale.xs))
                            .foregroundColor(.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(Spacing.s4)
                    }
                }
            }
        }
        .background(Color.backgroundPrimary)
        .navigationTitle("Diagnostics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button {
                    UIPasteboard.general.string = diagnostics.entries.joined(separator: "\n")
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .disabled(diagnostics.entries.isEmpty)
                Button {
                    diagnostics.clear()
                } label: {
                    Image(systemName: "trash")
                }
                .disabled(diagnostics.entries.isEmpty)
            }
        }
        .tint(.lemon)
    }
}

/// Wraps content in a text-selection container (UIKit-free spelling).
private struct SelectionContainer<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content.textSelection(.enabled)
    }
}
