// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Window security wiring.
//!
//! * Forces `always-on-top` off (a confidential-content window must never pin
//!   itself above a screen locker or other apps).
//! * On focus loss, emits `screenshot-attempt` so the frontend raises the same
//!   blur overlay the web client uses. On Linux this is the actual (best-effort)
//!   screenshot defense — there is no OS-level hard block available (see
//!   `screenshot.rs`).

use tauri::{WebviewWindow, WindowEvent};

use crate::screenshot;

/// Apply window hardening and register the focus-loss blur signal.
pub fn harden(window: &WebviewWindow) {
    // A message window must not force itself above everything else.
    if let Err(e) = window.set_always_on_top(false) {
        tracing::debug!(error = %e, "could not clear always-on-top");
    }

    let win = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            screenshot::signal_blur(&win);
        }
    });
}
