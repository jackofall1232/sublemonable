// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// Build-time configuration injected via the RELAY_ONION_ADDRESS build setting
/// (see Configuration/Release.xcconfig and Support/Info.plist).
public enum RelayConfig {
    /// The relay onion address. NEVER published in docs or committed to source —
    /// it is baked into the app at build time so the relay hidden service is not
    /// discoverable from the repository. Empty when the build did not set it
    /// (e.g. clearnet-only debug builds).
    public static let onionAddress: String =
        (Bundle.main.infoDictionary?["RELAY_ONION_ADDRESS"] as? String) ?? ""
}
