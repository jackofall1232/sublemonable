// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import SwiftUI
import UIKit
import CoreImage.CIFilterBuiltins

/// Key fingerprint display per design_system.components.key_fingerprint.
/// CRITICAL RULE: fingerprints ALWAYS render in JetBrains Mono (the
/// .monospaced system design is the mandated fallback when not bundled).
/// Format: groups of 4 hex characters separated by spaces.
public struct KeyFingerprintView: View {
    /// Pre-formatted safety number (groups of 4 hex), e.g. from
    /// `SafetyNumber.compute(...)`.
    public let fingerprint: String
    public var columns: Int = 4

    public init(fingerprint: String, columns: Int = 4) {
        self.fingerprint = fingerprint
        self.columns = columns
    }

    private var rows: [[String]] {
        let groups = fingerprint.split(separator: " ").map(String.init)
        return stride(from: 0, to: groups.count, by: columns).map {
            Array(groups[$0..<min($0 + columns, groups.count)])
        }
    }

    public var body: some View {
        VStack(spacing: Spacing.s2) {
            ForEach(rows.indices, id: \.self) { rowIndex in
                HStack(spacing: Spacing.s4) {
                    ForEach(rows[rowIndex], id: \.self) { group in
                        Text(group)
                            .font(SubFont.mono(TypeScale.lg))
                            .foregroundColor(.textSecondary)
                            .kerning(1.5)
                    }
                }
            }
        }
        .padding(Spacing.s5)
        .background(
            RoundedRectangle(cornerRadius: Radius.md)
                .fill(Color.backgroundElevated)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .strokeBorder(Color.borderToken, lineWidth: 1)
        )
        .accessibilityLabel("Safety number")
        .accessibilityValue(fingerprint)
    }
}

/// QR code rendering of a safety number (or contact-exchange payload), framed
/// with the lemon-yellow rounded border from the design system.
public struct FingerprintQRCode: View {
    public let payload: String
    public var size: CGFloat = 200

    public init(payload: String, size: CGFloat = 200) {
        self.payload = payload
        self.size = size
    }

    public var body: some View {
        Group {
            if let image = Self.generateQRCode(from: payload) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                // QR generation is local CoreImage work; failure is unexpected,
                // but the lemon spinner is the only permitted loading state.
                LemonSliceView(variant: .loadingSpinner)
                    .frame(width: 48, height: 48)
            }
        }
        .frame(width: size, height: size)
        .padding(Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radius.md).fill(Color.lemonPale))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .strokeBorder(Color.lemon, lineWidth: 3)
        )
    }

    static func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
