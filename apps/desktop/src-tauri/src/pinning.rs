// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Certificate pin values for the desktop client, kept in lockstep with the
//! mobile clients (`apps/ios/.../PinnedSessionDelegate.swift` and
//! `apps/android/.../net/CertificatePinning.kt`).
//!
//! Pins are SHA-256 over the leaf certificate's SubjectPublicKeyInfo (SPKI),
//! in the `sha256/<base64>` form OkHttp uses. The PRIMARY pin is the live
//! Let's Encrypt leaf; Caddy reuses its private key across renewals
//! (`tls { reuse_private_keys }`), so the value is stable through renewal. The
//! BACKUP pin is an offline-held spare key — point the server at it and clients
//! keep trusting it without an app update.
//!
//! ENFORCEMENT STATUS — not yet active on desktop. The REST/WebSocket traffic
//! is made by the bundled `apps/web` UI inside the system WebView, whose TLS
//! stack we cannot pin from JavaScript, and this Tauri crate currently has no
//! native HTTP client. To make these pins enforced, route the transport through
//! Rust (e.g. a `reqwest`/`rustls` client behind Tauri commands, or a local
//! WebView proxy) and reject any handshake whose leaf SPKI hash is not in
//! [`PINS`]. Sketch of the rustls verifier hook:
//!
//! ```ignore
//! // inside a rustls ServerCertVerifier, after the platform chain check:
//! let spki = leaf_cert.subject_public_key_info();           // DER SPKI bytes
//! let digest = sha2::Sha256::digest(spki);
//! let pin = format!("sha256/{}", base64::engine::general_purpose::STANDARD.encode(digest));
//! if !pinning::is_pinned(&pin) { return Err(rustls::Error::General("pin mismatch".into())); }
//! ```

/// Host these pins apply to. Must match the server URL the bundled web UI
/// connects to (build the desktop bundle with
/// `VITE_SERVER_URL=https://relay.sublemonable.com`).
pub const API_HOST: &str = "relay.sublemonable.com";

/// Primary pin — the live Let's Encrypt leaf key (stable across renewals).
pub const PRIMARY_PIN: &str = "sha256/TZbasNP1niaVV0fEtpn2QbjY1QiIS8R7w4zhaU5Yw3U=";

/// Backup pin — an offline-held spare key. Drop the old pin only after shipping
/// an update that has rotated the server to a new key pair.
pub const BACKUP_PIN: &str = "sha256/BoqfuAlHFGnQJiL9nv7n7lAnRMixTWhpCWCs8v1eepM=";

/// All accepted pins, in preference order.
pub const PINS: [&str; 2] = [PRIMARY_PIN, BACKUP_PIN];

/// True if `spki_pin` (a `sha256/<base64>` SPKI hash computed from a leaf
/// certificate) matches one of the pinned values. Constant-time-ish membership
/// is unnecessary here: pins are public and the comparison reveals nothing.
pub fn is_pinned(spki_pin: &str) -> bool {
    PINS.contains(&spki_pin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_pins_accepted() {
        assert!(is_pinned(PRIMARY_PIN));
        assert!(is_pinned(BACKUP_PIN));
    }

    #[test]
    fn unknown_pin_rejected() {
        assert!(!is_pinned("sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
    }
}
