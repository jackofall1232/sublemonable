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
//! ENFORCEMENT STATUS — **active on desktop**.
//!
//! All REST and WebSocket traffic is routed through native Tauri commands
//! (`pinned_request`, `ws_open`/`ws_send`/`ws_close`) backed by a
//! `reqwest`/`tokio-tungstenite` client with a custom `rustls` verifier
//! ([`transport::PinnedVerifier`]). `apps/web` invokes these commands via
//! `nativeTransport.ts` (`nativeRequest` / `NativeWsSocket`) rather than the
//! WebView's own `fetch`/`WebSocket`, so the WebView's unpinned TLS stack is
//! never used for transport to the relay.
//!
//! Pinning applies to **clearnet connections only**. Over Tor (`.onion`) and I2P
//! (`.b32.i2p`), the destination address is the cryptographic identity — pinning
//! is not needed and not applied (see docs/TOR_ARCHITECTURE.md §4). I2P REST
//! traffic uses `i2p_request` (see `i2p.rs`), which routes through the local
//! i2pd HTTP proxy and validates against the build-time `RELAY_I2P_DEST` constant.

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
